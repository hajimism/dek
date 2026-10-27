import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { addressHint, deckAround } from "../../src/cli/address.ts";
import { lintCommand } from "../../src/cli/lint.ts";
import { addressResult } from "../../src/cli/result.ts";
import { resolveTarget } from "../../src/cli/scope.ts";
import { REF_MARKER } from "../../src/core/ref.ts";
import { runMain } from "../helpers/cli.ts";
import { withEnv } from "../helpers/env.ts";
import { REF_SHA, withTempProject } from "../helpers/project.ts";
import { AWKWARD_NAMES, hintCommands, UNWRITABLE_NAMES } from "../helpers/shell.ts";

// Hints are written as if run inside the deck they are about. The CLI knows where it ran, so it
// names the deck in every command that takes one, and a hint runs as written from anywhere.
describe("addressHint", () => {
  const root = "/p";
  const demo = { name: "demo", dir: "/p/decks/demo" };

  test("names the deck when the command ran outside it", () => {
    expect(addressHint("run `dekc theme` to see the layouts", demo, root)).toBe(
      "run `dekc theme demo` to see the layouts",
    );
    expect(addressHint("fix it, then run `dekc check intro` again", demo, root)).toBe(
      "fix it, then run `dekc check demo intro` again",
    );
    expect(addressHint("run `dekc mv old new`, or `dekc sync`", demo, root)).toBe(
      "run `dekc mv demo old new`, or `dekc sync demo`",
    );
  });

  test("leaves a hint alone inside the deck", () => {
    for (const cwd of ["/p/decks/demo", "/p/decks/demo/slides"]) {
      expect(addressHint("run `dekc theme`", demo, cwd)).toBe("run `dekc theme`");
    }
  });

  test("uses --deck inside another deck, where a first word names something in that deck", async () => {
    await withTempProject({ decks: [{ name: "demo" }, { name: "other" }] }, async (root) => {
      const deck = { name: "demo", dir: join(root, "decks", "demo") };
      expect(addressHint("run `dekc theme`", deck, join(root, "decks", "other"))).toBe(
        "run `dekc theme --deck demo`",
      );
    });
  });

  test("leaves commands that take no deck, and ones that already name it", () => {
    for (const hint of [
      "run `dekc init`",
      "run `dekc new talk`",
      "run `dekc ref owner/repo/deck`",
      "run `dekc help --agent`",
      "run `dekc theme demo`",
      "run `dekc show owner/repo/deck intro`",
      "run `dekc check --deck demo intro`",
      "use `dek`-style names",
    ]) {
      expect(addressHint(hint, demo, root)).toBe(hint);
    }
  });

  test("names a deck a shell reads as one word, once, without a backtick", async () => {
    await withTempProject({ decks: [{ name: "other" }] }, async (project) => {
      for (const name of [...AWKWARD_NAMES, "講演"]) {
        const deck = { name, dir: join(project, "decks", name) };
        const outside = addressHint("run `dekc theme`, then `dekc check intro`", deck, project);
        expect(hintCommands(outside)).toEqual([
          ["dekc", "theme", name],
          ["dekc", "check", name, "intro"],
        ]);
        expect([...outside].filter((char) => char === "`").length).toBe(4);
        expect(addressHint(outside, deck, project)).toBe(outside);
        const inOther = addressHint("run `dekc theme`", deck, join(project, "decks", "other"));
        expect(hintCommands(inOther)).toEqual([["dekc", "theme", "--deck", name]]);
        expect(addressHint(inOther, deck, join(project, "decks", "other"))).toBe(inOther);
      }
      expect(addressHint("run `dekc theme`", { name: "講演", dir: "/p/decks/講演" }, "/p")).toBe(
        "run `dekc theme 講演`",
      );
    });
  }, 30_000);

  test("writes a placeholder for a deck no word holds alike in every shell, and says where it is", () => {
    for (const name of UNWRITABLE_NAMES) {
      const deck = { name, dir: `/p/decks/${name}` };
      const hint = addressHint("run `dekc theme`, then `dekc check intro`", deck, "/p");
      expect(hint).toBe(
        "run `dekc theme <deck>`, then `dekc check <deck> intro`; for <deck>, name the deck as `dekc ls` lists it",
      );
      expect(addressHint(hint, deck, "/p")).toBe(hint);
    }
  });

  test("names a deck that would read as a flag or a subcommand with --deck", () => {
    const deck = (name: string) => ({ name, dir: `/p/decks/${name}` });
    const cases: Array<[string, string, string]> = [
      ["-x", "run `dekc theme`", "run `dekc theme --deck=-x`"],
      ["--before=intro", "run `dekc mv a b`", "run `dekc mv --deck=--before=intro a b`"],
      ["clear", "run `dekc marks clear`", "run `dekc marks --deck clear clear`"],
      ["pin", "run `dekc voice pin`", "run `dekc voice --deck pin pin`"],
      ["dict", "run `dekc voice dict add a b`", "run `dekc voice --deck dict dict add a b`"],
    ];
    for (const [name, hint, addressed] of cases) {
      expect(addressHint(hint, deck(name), "/p")).toBe(addressed);
      expect(addressHint(addressed, deck(name), "/p")).toBe(addressed);
    }
    expect(addressHint("run `dekc theme`", deck("clear"), "/p")).toBe("run `dekc theme clear`");
  });

  test("leaves every hint alone when there is no deck to name", () => {
    expect(addressHint("run `dekc theme`", undefined, root)).toBe("run `dekc theme`");
  });

  test("names each deck file as a path from where the command ran, as diagnostic paths are", () => {
    const hints = [
      "cut it, or give it a smaller size in slides/intro.css",
      "theme.css alone draws it below 4.5:1: fix the pair in theme.css",
      "add a section for it to script.md, like `## Intro {#intro}`, or remove slides/intro.html",
      "run `mv slides/intro.js slides/intro.ts`; plain JavaScript is valid TypeScript",
      "create voice/voice.toml in the deck with a speaker",
      "the project has it: copy ../../assets/logo.svg into the deck's assets/",
    ];
    expect(hints.map((hint) => addressHint(hint, demo, root))).toEqual([
      "cut it, or give it a smaller size in decks/demo/slides/intro.css",
      "decks/demo/theme.css alone draws it below 4.5:1: fix the pair in decks/demo/theme.css",
      "add a section for it to decks/demo/script.md, like `## Intro {#intro}`, or remove decks/demo/slides/intro.html",
      "run `mv decks/demo/slides/intro.js decks/demo/slides/intro.ts`; plain JavaScript is valid TypeScript",
      "create decks/demo/voice/voice.toml in the deck with a speaker",
      "the project has it: copy assets/logo.svg into the deck's assets/",
    ]);
    expect(addressHint(hints[0] ?? "", demo, "/p/decks/demo/slides")).toBe(
      "cut it, or give it a smaller size in intro.css",
    );
    expect(addressHint(hints[1] ?? "", demo, "/p/decks/other")).toBe(
      "../demo/theme.css alone draws it below 4.5:1: fix the pair in ../demo/theme.css",
    );
    for (const hint of hints) {
      expect(addressHint(hint, demo, demo.dir)).toBe(hint);
    }
  });

  test("leaves a deck file as written when the path from where the command ran is no plain word", () => {
    const odd = { name: "odd", dir: "/p/decks/a`b" };
    const hint = "cut it, or give it a smaller size in slides/intro.css";
    expect(addressHint(hint, odd, root)).toBe(hint);
  });

  test("leaves what only looks like a deck file", () => {
    for (const hint of [
      "copy decks/demo/theme.css into the new deck",
      "see https://hajimism.github.io/dek/guide/voice.html#setup",
      "a rule in slides/<id>.css weighs as if it were in a theme.css-like file",
      "download it into assets/ and use assets/logo.svg",
    ]) {
      expect(addressHint(hint, demo, root)).toBe(hint);
    }
  });
});

describe("deckAround", () => {
  test("finds the deck a source path is in", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const dir = join(root, "decks", "demo");
      expect(deckAround(join(dir, "slides", "intro.html"))).toEqual({ name: "demo", dir });
      expect(deckAround(join(dir, "theme.css"))).toEqual({ name: "demo", dir });
      expect(deckAround(join(root, "dek.toml"))).toBeUndefined();
    });
  });

  test("names a ref's deck by the ref, as the commands that read it take it", async () => {
    await withTempProject({ refs: [{ name: "o/r/d" }] }, async (root) => {
      const dir = join(root, "refs", "o", "r", "d", "decks", "d");
      expect(deckAround(join(dir, "script.md"))).toEqual({ name: "o/r/d", dir });
      expect(addressHint("run `dekc ls`", deckAround(join(dir, "script.md")), root)).toBe(
        "run `dekc ls o/r/d`",
      );
    });
  });

  test("names a deck by a ref only in a snapshot dek wrote", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const marker = { name: "o/r/d", rev: REF_SHA, path: "decks/demo" };
      await writeFile(join(root, REF_MARKER), JSON.stringify(marker));
      const dir = join(root, "decks", "demo");
      expect(deckAround(join(dir, "script.md"))).toEqual({ name: "demo", dir });
    });
  });

  test("finds none where no deck is, so a missing deck's hint does not name it", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      expect(deckAround(join(root, "decks", "nope"))).toBeUndefined();
      expect(addressHint("run `dekc ls`", deckAround(join(root, "decks", "nope")), root)).toBe(
        "run `dekc ls`",
      );
    });
  });
});

describe("addressResult", () => {
  test("a lint run at the project root hints commands that run from the root", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: {
              intro:
                '<section class="slide" data-layout="nope"><h2 class="slide-title">Demo</h2></section>\n',
            },
          },
        ],
      },
      async (root) => {
        const target = resolveTarget(root, "decks", { deck: "demo" });
        const data = await lintCommand(target, { cwd: root });
        const addressed = addressResult(
          { command: "lint", data },
          { cwd: root, deck: { name: "demo", dir: join(root, "decks", "demo") } },
        );
        if (addressed.command !== "lint") {
          throw new Error("expected a lint result");
        }
        const layout = addressed.data.diagnostics.find((d) => d.id === "DEK019");
        expect(layout?.hint).toContain("`dekc theme demo`");
        expect(addressed.data.skipped?.find((s) => s.check === "visual")?.hint).toBe(
          "run `dekc lint demo --visual` to measure overflow, contrast, line breaks, and alignment",
        );
      },
    );
  });

  test.serial(
    "a visual lint at the project root names the files to fix from the root",
    async () => {
      await withTempProject(
        {
          decks: [
            {
              name: "demo",
              slides: {
                intro:
                  '<section class="slide" data-layout="default"><h2 class="slide-title">Demo</h2><p>small print</p></section>\n',
              },
            },
          ],
        },
        async (root) => {
          // A worker that answers with one overflow and one contrast finding, as Playwright would.
          const found = {
            overflows: [
              { slug: "intro", step: "0", box: "p", text: "small print", by: { bottom: 30 } },
            ],
            contrasts: [
              {
                slug: "intro",
                step: "0",
                box: "p",
                text: "small print",
                ratio: 1.3,
                fg: "rgb(39, 39, 39)",
                bg: "rgb(17, 17, 17)",
                fontSize: 16,
                fontWeight: 400,
                origin: "slide",
              },
            ],
          };
          const worker = join(root, "worker.ts");
          await writeFile(
            worker,
            `await Bun.stdin.text();\nprocess.stdout.write(${JSON.stringify(`${JSON.stringify(found)}\n`)});\n`,
          );
          const printed = await withEnv({ DEK_PLAYWRIGHT: worker }, () =>
            runMain(["lint", "--visual", "--json"], root),
          );
          const { diagnostics } = JSON.parse(printed.stdout) as {
            diagnostics: Array<{ id: string; path: string; hint: string }>;
          };
          const css = "decks/demo/slides/intro.css";
          expect(diagnostics.find((d) => d.id === "DEK030")).toMatchObject({
            path: "decks/demo/slides/intro.html",
            hint: `cut it, split it across beats or slides, or give it a smaller size in ${css}`,
          });
          expect(diagnostics.find((d) => d.id === "DEK031")).toMatchObject({
            path: css,
            hint: `${css} brings it below 4.5:1, which decks/demo/theme.css alone does not: raise its contrast in ${css}`,
          });
        },
      );
    },
  );
});
