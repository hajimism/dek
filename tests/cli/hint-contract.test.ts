import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import fc from "fast-check";
import { type AnySpec, COMMANDS } from "../../src/cli/commands.ts";
import { parseCommandLine } from "../../src/cli/flags.ts";
import { bindCommandLine } from "../../src/cli/main.ts";
import { isRefName } from "../../src/core/ref-name.ts";
import { syncDeck } from "../../src/core/sync.ts";
import { runMain } from "../helpers/cli.ts";
import { propertyTest } from "../helpers/fc.ts";
import { slideDocument } from "../helpers/html.ts";
import { type DeckSpec, type ProjectSpec, withTempProject } from "../helpers/project.ts";

// Criterion 4: a command in a hint succeeds when run, as written, in the state that produced it.
// Each state below is one an agent reaches in ordinary work. From inside the deck and from the
// project root, every `dekc ...` a diagnostic's hint names is run on a fresh copy of that state:
// it must answer with a result, and a hint that is only a command that changes files, such as
// `run \`dekc mv a b\``, must clear the finding that named it.

type Diagnostic = { id: string; slug?: string; hint?: string };
/** What `--json` prints: a result, or an error. A lint that finds errors is still a result. */
type Printed = {
  ok: boolean;
  diagnostics?: Diagnostic[];
  error?: { message: string; hint?: string };
};

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

/** A deck of the generated project: which sections its script has, and which slide files. */
const generatedDeck = (name: string) =>
  fc
    .record({
      sections: fc.subarray(["intro", "end"], { minLength: 1 }),
      // `intor` is a slide file no section names.
      slides: fc.subarray(["intro", "end", "intor"]),
    })
    .map(({ sections, slides }) => ({
      name,
      script: `---\ntitle: Demo\n---\n\n${sections.map((slug) => `## ${slug}\n\nx\n`).join("\n")}`,
      slides: Object.fromEntries(slides.map((slug) => [slug, written])),
    }));

/** A project an agent may be in, two decks or fewer and a ref or none, and where it runs dek. */
const generatedState = fc.record({
  decks: fc
    .tuple(
      fc.option(generatedDeck("demo"), { nil: undefined }),
      fc.option(generatedDeck("talk"), { nil: undefined }),
    )
    .map((decks) => decks.filter((deck) => deck !== undefined)),
  ref: fc.boolean(),
  inDeck: fc.boolean(),
});

/** A command an agent may type: its deck a deck, a ref, a typo, a missing one, or none. */
const typedLine = fc
  .tuple(
    fc.constantFrom("ls", "show", "check", "theme", "lint", "sync", "mv", "new", "cues"),
    fc.constantFrom(undefined, "demo", "talk", "o/r/d", "demi", "nope"),
    fc.constantFrom("intro", "end", "intor", "nope"),
  )
  .map(([command, deck, slug]) => [
    command,
    ...(deck ? [deck] : []),
    ...(command === "show" || command === "check" ? [slug] : command === "mv" ? [slug, "x"] : []),
  ]);

/** A deck command an agent may type, naming no deck: a slide, or a layout for `dekc theme`. */
const undecked = fc
  .tuple(
    fc.constantFrom("show", "check", "mv", "theme"),
    fc.constantFrom("intro", "end", "intor", "nope", "title"),
  )
  .map(([command, word]) => (command === "mv" ? [command, word, "x"] : [command, word]));

/**
 * A state and the line typed in it, half of them where hints have gone wrong: a deck command
 * naming no deck at the root of a project of two decks, a deck that is not there, and a ref.
 */
const generatedCase = fc.oneof(
  { weight: 3, arbitrary: fc.tuple(generatedState, typedLine) },
  fc.tuple(
    fc.record({
      decks: fc.tuple(generatedDeck("demo"), generatedDeck("talk")),
      ref: fc.boolean(),
      inDeck: fc.constant(false),
    }),
    undecked,
  ),
  fc.tuple(
    generatedState,
    fc
      .tuple(fc.constantFrom("ls", "show", "lint", "theme"), fc.constantFrom("nope", "demi"))
      .map(([command, deck]) => (command === "show" ? [command, deck, "intro"] : [command, deck])),
  ),
  fc.tuple(
    fc.record({
      decks: fc.constant<DeckSpec[]>([]),
      ref: fc.constant(true),
      inDeck: fc.constant(false),
    }),
    fc.constantFrom(["show", "o/r/d", "intor"], ["show", "o/r/d", "nope"], ["ls", "o/r/d"]),
  ),
);

describe("every hint over generated project states", () => {
  // Whatever an agent types in whatever project: every error says what to do next, and every
  // `dekc ...` a hint names is a command, with the words its form takes, that takes a ref
  // wherever it names one, and that runs as written in a fresh copy of the state that produced it.
  propertyTest(
    "names a command that runs as written",
    fc.asyncProperty(generatedCase, async ([state, argv]) => {
      const spec = { decks: state.decks, refs: state.ref ? [{ name: "o/r/d" }] : [] };
      const [deck] = state.decks;
      const cwdOf = (root: string) =>
        state.inDeck && deck ? join(root, "decks", deck.name) : root;
      const hinted = await withTempProject(spec, async (root) => {
        const cwd = cwdOf(root);
        const printed = JSON.parse((await runMain([...argv, "--json"], cwd)).stdout) as Printed;
        expect({ argv, hint: printed.ok || Boolean(printed.error?.hint) }).toEqual({
          argv,
          hint: true,
        });
        const hints = [printed.error?.hint, ...(printed.diagnostics ?? []).map((d) => d.hint)];
        const commands = hints.flatMap(commandsOf);
        for (const words of commands) {
          // A placeholder stands for a word the agent picks.
          const typed = words.map((word) => word.replace(/^<[-\w]+>$/, "x"));
          const call = bindCommandLine(cwd, parseCommandLine(typed));
          const takesRefs = (COMMANDS[call.name] as AnySpec).refs === true;
          expect({ hinted: words, ref: isRefName(call.deck ?? "") && !takesRefs }).toEqual({
            hinted: words,
            ref: false,
          });
        }
        return commands;
      });
      // `dekc ref` reaches GitHub; a placeholder is the agent's to fill.
      for (const words of hinted.filter(
        (words) => runsHere(words) && words[0] !== "ref" && !words.some((w) => w.startsWith("<")),
      )) {
        await withTempProject(spec, async (root) => {
          const argvAgain = [...words.filter((word) => word !== "--json"), "--json"];
          const again = JSON.parse((await runMain(argvAgain, cwdOf(root))).stdout) as Printed;
          expect({ argv, hinted: words, ran: ran(again), error: again.error }).toMatchObject({
            argv,
            hinted: words,
            ran: true,
          });
        });
      }
    }),
    { runs: 40, serial: true },
  );
});
