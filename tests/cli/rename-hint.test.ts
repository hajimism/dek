import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mvCommand } from "../../src/cli/mv.ts";
import { requireDeckFromCwd, resolveDecks } from "../../src/cli/scope.ts";
import { syncCommand } from "../../src/cli/sync.ts";
import type { Diagnostic } from "../../src/core/diagnostic.ts";
import { lintDeck } from "../../src/core/lint.ts";
import { syncDeck } from "../../src/core/sync.ts";
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
    mvCommand(requireDeckFromCwd(cwd), { slug: args[0] ?? "", to: args[1] });
  } else if (command === "sync") {
    syncCommand(resolveDecks(cwd));
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
          expect(orphan?.hint).toBe(
            "run `dek mv before after` to move the files to the script's id, or `dek mv after before` to give the section the files' id",
          );

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
      expect(lintResult.diagnostics.find((d) => d.id === "DEK002")?.hint).not.toContain("dek mv");
      expect(() => run(["mv", "before", "after"], deck)).toThrow(
        "slides/before.html and slides/after.html both hold a slide you wrote",
      );
      expect(existsSync(join(deck, "slides", "before.html"))).toBe(true);
    });
  });
});

/** The files are already `after.*`; the script still says `before`. */
async function withFilesRenamed(
  fn: (deck: string) => Promise<void>,
  options: { skeleton?: boolean } = {},
): Promise<void> {
  await withTempProject(
    { decks: [{ name: "demo", script: script("before"), slides: { after: written } }] },
    async (root) => {
      const deck = join(root, "decks", "demo");
      await writeFile(join(deck, "slides", "after.css"), ".slide { }\n");
      if (options.skeleton) {
        // What the dev server does on save: a skeleton for the id the script still has.
        syncDeck(deck);
      }
      await fn(deck);
    },
  );
}

describe("renaming after moving the files first", () => {
  for (const [state, skeleton] of [
    ["the old HTML is gone", false],
    ["the dev server already made a skeleton for the old id", true],
  ] as const) {
    test(`dek mv gives the section the files' id when ${state}`, async () => {
      await withFilesRenamed(
        async (deck) => {
          run(["mv", "before", "after"], deck);

          expect(await readFile(join(deck, "slides", "after.html"), "utf8")).toBe(written);
          expect(existsSync(join(deck, "slides", "after.css"))).toBe(true);
          expect(existsSync(join(deck, "slides", "before.html"))).toBe(false);
          expect(await readFile(join(deck, "script.md"), "utf8")).toBe(script("after"));
          expect((await lint(deck)).diagnostics).toEqual([]);
        },
        { skeleton },
      );
    });

    test(`lint offers the rename the files already made when ${state}`, async () => {
      await withFilesRenamed(
        async (deck) => {
          const orphan = (await lint(deck)).diagnostics.find((d) => d.id === "DEK002");
          const [, second] = [...(orphan?.hint ?? "").matchAll(/`dek ([^`]+)`/g)].map((m) =>
            (m[1] ?? "").split(" "),
          );
          expect(second).toEqual(["mv", "before", "after"]);

          run(second ?? [], deck);

          expect(await readFile(join(deck, "slides", "after.html"), "utf8")).toBe(written);
          expect((await lint(deck)).diagnostics).toEqual([]);
        },
        { skeleton },
      );
    });
  }

  test("refuses when both ids hold edited slides, and never asks to delete one", async () => {
    await withFilesRenamed(async (deck) => {
      const other = written.replace("hand-written", "the other one");
      await writeFile(join(deck, "slides", "before.html"), other);
      let error: unknown;
      try {
        run(["mv", "before", "after"], deck);
      } catch (caught) {
        error = caught;
      }
      expect(error).toMatchObject({
        message: "slides/before.html and slides/after.html both hold a slide you wrote",
        hint: "merge them into slides/after.html and remove slides/before.html, then run `dek mv before after` again",
      });
      expect(await readFile(join(deck, "slides", "before.html"), "utf8")).toBe(other);
      expect(await readFile(join(deck, "slides", "after.html"), "utf8")).toBe(written);
      expect(await readFile(join(deck, "script.md"), "utf8")).toBe(script("before"));
    });
  });
});

describe("rename hints", () => {
  /** Every `dek ...` command a hint names, as argv. */
  function commandsOf(hint: string | undefined): string[][] {
    return [...(hint ?? "").matchAll(/`dek ([^`]+)`/g)].map((m) => (m[1] ?? "").split(" "));
  }

  test("name every section the orphan could be when more than one could, and never the delete", async () => {
    // The dev server is running: the author adds `qa`, then renames `before` to `after`.
    await withScriptRenamed(async (deck) => {
      await writeFile(join(deck, "script.md"), `${script("after")}\n## 質疑応答 {#qa}\n\nthanks\n`);
      syncDeck(deck);

      const orphan = (await lint(deck)).diagnostics.find((d) => d.id === "DEK002");
      expect(orphan?.hint).toBe(
        "run `dek mv before after` or `dek mv before qa` to move the files to the section they now belong to",
      );
      expect(orphan?.data).toMatchObject({ renames: ["after", "qa"] });

      run(commandsOf(orphan?.hint)[0] ?? [], deck);

      expect(await readFile(join(deck, "slides", "after.html"), "utf8")).toBe(written);
      expect(existsSync(join(deck, "slides", "qa.html"))).toBe(true);
      expect((await lint(deck)).diagnostics).toEqual([]);
    });
  });

  test("name every section without its own HTML as a place the orphan could go", async () => {
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
        const deck = join(root, "decks", "demo");
        const diagnostics = (await lint(deck)).diagnostics;
        const orphan = diagnostics.find((d) => d.id === "DEK002");
        expect(commandsOf(orphan?.hint)).toEqual([
          ["mv", "leftover", "a"],
          ["mv", "leftover", "b"],
        ]);
        // Each section still gets its own skeleton if it was not a rename.
        for (const missing of diagnostics.filter((d) => d.id === "DEK001")) {
          expect(missing.hint).toBe("run `dek sync` to create the skeleton");
        }
      },
    );
  });

  test("keep the section-or-remove hint when nothing could be a rename", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: {
              intro: slideDocument('<section class="slide"></section>'),
              leftover: written,
            },
          },
        ],
      },
      async (root) => {
        const deck = join(root, "decks", "demo");
        syncDeck(deck);
        const orphan = (await lint(deck)).diagnostics.find((d) => d.id === "DEK002");
        expect(orphan?.hint).toBe(
          "add a section for it to script.md, like `## Leftover {#leftover}`, or remove slides/leftover.html if the slide is gone from the talk",
        );
        expect(orphan?.data).not.toHaveProperty("renames");
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
