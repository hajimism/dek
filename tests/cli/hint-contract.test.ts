import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { syncDeck } from "../../src/core/sync.ts";
import { runMain } from "../helpers/cli.ts";
import { slideDocument } from "../helpers/html.ts";
import { type ProjectSpec, withTempProject } from "../helpers/project.ts";

// Criterion 4: a command in a hint succeeds when run, as written, in the state that produced it.
// Each state below is one an agent reaches in ordinary work. From inside the deck and from the
// project root, every `dekc ...` a diagnostic's hint names is run on a fresh copy of that state:
// it must answer with a result, and a hint that is only a command that changes files, such as
// `run \`dekc mv a b\``, must clear the finding that named it.

type Diagnostic = { id: string; slug?: string; hint?: string };
/** What `--json` prints: a result, or an error. A lint that finds errors is still a result. */
type Printed = { ok: boolean; diagnostics?: Diagnostic[]; error?: { message: string } };

/** The command ran: it answered with its result, not with why it could not run. */
function ran(printed: Printed): boolean {
  return printed.ok || printed.diagnostics !== undefined;
}

type State = {
  name: string;
  spec: ProjectSpec;
  /** What the agent did after the project was made, from its root. */
  setup?: (root: string) => Promise<void>;
};

const written = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">hand-written</h2>
</section>`);

const script = (sections: string) =>
  `---\ntitle: Demo\n---\n\n## Intro {#intro}\n\nhello\n${sections}`;

const deckDir = (root: string) => join(root, "decks", "demo");

const STATES: State[] = [
  { name: "a section without its slide", spec: { decks: [{ name: "demo" }] } },
  {
    name: "a heading that is only an id",
    spec: { decks: [{ name: "demo", script: script("\n## quote\n\nq\n") }] },
    setup: async (root) => {
      syncDeck(deckDir(root));
    },
  },
  {
    name: "a heading renamed in script.md first",
    spec: {
      decks: [{ name: "demo", script: script(""), slides: { intro: written, before: written } }],
    },
    setup: async (root) => {
      await writeFile(join(deckDir(root), "script.md"), script("\n## Moved {#after}\n\nx\n"));
      syncDeck(deckDir(root));
    },
  },
  {
    name: "a section added, then another renamed, while the dev server syncs",
    spec: {
      decks: [{ name: "demo", script: script(""), slides: { intro: written, before: written } }],
    },
    setup: async (root) => {
      await writeFile(
        join(deckDir(root), "script.md"),
        script("\n## Moved {#after}\n\nx\n\n## 質疑応答 {#qa}\n\nthanks\n"),
      );
      syncDeck(deckDir(root));
    },
  },
  {
    name: "slide files renamed first",
    spec: {
      decks: [
        {
          name: "demo",
          script: script("\n## Old {#old}\n\nx\n"),
          slides: { intro: written, new: written },
        },
      ],
    },
  },
  {
    name: "a layout and a class the theme does not have",
    spec: {
      decks: [
        {
          name: "demo",
          slides: {
            intro: slideDocument(`<section class="slide" data-layout="titel">
  <h2 class="slide-title mystery">intro</h2>
</section>`),
          },
        },
      ],
    },
  },
];

/** Commands that open a browser or keep running: their hints are checked where they run. */
function runsHere(argv: string[]): boolean {
  const [command] = argv;
  return (
    command !== undefined &&
    !["shot", "pdf", "pptx", "video", "serve", "rehearse"].includes(command) &&
    !argv.includes("--visual")
  );
}

function commandsOf(hint: string | undefined): string[][] {
  return [...(hint ?? "").matchAll(/`dekc ([^`]+)`/g)].map((match) => (match[1] ?? "").split(" "));
}

const CHANGES_FILES = new Set(["sync", "mv"]);

async function lint(cwd: string): Promise<Diagnostic[]> {
  const printed = JSON.parse((await runMain(["lint", "--json"], cwd)).stdout) as Printed;
  expect(ran(printed)).toBe(true);
  return printed.diagnostics ?? [];
}

async function inState<T>(state: State, fn: (root: string) => Promise<T>): Promise<T> {
  return withTempProject(state.spec, async (root) => {
    await state.setup?.(root);
    return fn(root);
  });
}

describe("every command a hint names runs as written", () => {
  for (const state of STATES) {
    for (const where of ["deck", "root"] as const) {
      test.serial(`${state.name}, from the ${where}`, async () => {
        const cwdOf = (root: string) => (where === "deck" ? deckDir(root) : root);
        const found = await inState(state, async (root) => lint(cwdOf(root)));
        const hinted = found.flatMap((diagnostic) =>
          commandsOf(diagnostic.hint)
            .filter(runsHere)
            .map((argv) => ({ diagnostic, argv })),
        );
        expect(hinted.length).toBeGreaterThan(0);
        for (const { diagnostic, argv } of hinted) {
          await inState(state, async (root) => {
            const cwd = cwdOf(root);
            const result = await runMain([...argv, "--json"], cwd);
            const printed = JSON.parse(result.stdout) as Printed;
            expect({ argv, ran: ran(printed), error: printed.error }).toMatchObject({
              argv,
              ran: true,
            });
            // A hint that opens with the command is the whole fix; "do X, then run" is a step.
            if (CHANGES_FILES.has(argv[0] ?? "") && diagnostic.hint?.startsWith("run `dekc ")) {
              const after = await lint(cwd);
              expect({ argv, left: after.filter((d) => sameFinding(d, diagnostic)) }).toEqual({
                argv,
                left: [],
              });
            }
          });
        }
      });
    }
  }
});

function sameFinding(a: Diagnostic, b: Diagnostic): boolean {
  return a.id === b.id && a.slug === b.slug;
}
