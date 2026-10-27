import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { addressHint, deckAround } from "../../src/cli/address.ts";
import { lintCommand } from "../../src/cli/lint.ts";
import { addressResult } from "../../src/cli/result.ts";
import { resolveTarget } from "../../src/cli/scope.ts";
import { withTempProject } from "../helpers/project.ts";
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
});
