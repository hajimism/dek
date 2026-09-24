import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mvCommand } from "../../src/cli/mv.ts";
import { syncCommand } from "../../src/cli/sync.ts";
import { type Diagnostic, lintDeck, syncDeck } from "../../src/core/index.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const written = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">hand-written</h2>
</section>`);

function script(id: string): string {
  return `---\ntitle: Demo\n---\n\n## 問題 {#${id}}\n\nbody\n`;
}

/** The command inside the first backticks of a hint, as argv. */
function commandOf(hint: string | undefined): string[] {
  const match = hint?.match(/`dek ([^`]+)`/);
  if (!match?.[1]) {
    throw new Error(`no dek command in hint: ${hint}`);
  }
  return match[1].split(" ");
}

async function lint(deck: string): Promise<{ ok: boolean; diagnostics: Diagnostic[] }> {
  const diagnostics = lintDeck(deck);
  return { ok: diagnostics.length === 0, diagnostics };
}

/** Runs the `dek mv` or `dek sync` a hint names, the way the CLI would. */
function run(argv: string[], cwd: string): void {
  const [command, ...args] = argv;
  if (command === "mv") {
    mvCommand({ cwd, slug: args[0], to: args[1] });
  } else if (command === "sync") {
    syncCommand({ cwd });
  } else {
    throw new Error(`unexpected command: ${argv.join(" ")}`);
  }
}

/** The script already says `after`; the hand-written HTML is still `before.html`. */
async function withScriptRenamed(
  fn: (deck: string) => Promise<void>,
  options: { skeleton?: boolean } = {},
): Promise<void> {
  await withTempProject(
    { decks: [{ name: "demo", script: script("before"), slides: { before: written } }] },
    async (root) => {
      const deck = join(root, "decks", "demo");
      await writeFile(join(deck, "slides", "before.css"), ".slide { }\n");
      await writeFile(join(deck, "script.md"), script("after"));
      if (options.skeleton) {
        // What the dev server does on save: a skeleton for the new id.
        syncDeck(deck);
      }
      await fn(deck);
    },
  );
}

describe("renaming after editing script.md first", () => {
  for (const [state, skeleton] of [
    ["the new HTML is missing", false],
    ["the dev server already made a skeleton", true],
  ] as const) {
    test(`lint's dek mv hint works as written when ${state}`, async () => {
      await withScriptRenamed(
        async (deck) => {
          const before = await lint(deck);
          expect(before.ok).toBe(false);
          const orphan = before.diagnostics.find((d) => d.id === "DEK002");
          expect(orphan?.hint).toBe("run `dek mv before after`");

          run(commandOf(orphan?.hint), deck);

          expect(await readFile(join(deck, "slides", "after.html"), "utf8")).toBe(written);
          expect(existsSync(join(deck, "slides", "after.css"))).toBe(true);
          expect(existsSync(join(deck, "slides", "before.html"))).toBe(false);
          expect(await readFile(join(deck, "script.md"), "utf8")).toBe(script("after"));
          expect((await lint(deck)).diagnostics).toEqual([]);
        },
        { skeleton },
      );
    });
  }

  test("refuses to overwrite a new HTML file that was edited", async () => {
    await withScriptRenamed(async (deck) => {
      await writeFile(
        join(deck, "slides", "after.html"),
        written.replace("hand-written", "edited"),
      );
      const lintResult = await lint(deck);
      expect(lintResult.diagnostics.find((d) => d.id === "DEK002")?.hint).toBeUndefined();
      expect(() => run(["mv", "before", "after"], deck)).toThrow('slide "after" already exists');
      expect(existsSync(join(deck, "slides", "before.html"))).toBe(true);
    });
  });
});

describe("rename hints", () => {
  test("do not guess when two sections could be the target", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---\ntitle: Demo\n---\n\n## a {#a}\n\nx\n\n## b {#b}\n\ny\n`,
            slides: { leftover: written },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.find((d) => d.id === "DEK002")?.hint).toBeUndefined();
      },
    );
  });
});

describe("DEK001 hints", () => {
  test("a missing slide on its own suggests dek sync", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const deck = join(root, "decks", "demo");
      const dek001 = (await lint(deck)).diagnostics.find((d) => d.id === "DEK001");
      expect(dek001?.hint).toBe("run `dek sync` to create the skeleton");
      run(commandOf(dek001?.hint), deck);
      expect((await lint(deck)).diagnostics).toEqual([]);
    });
  });
});
