import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { addressHint, deckAround } from "../../src/cli/address.ts";
import { lintCommand } from "../../src/cli/lint.ts";
import { addressResult } from "../../src/cli/result.ts";
import { resolveTarget } from "../../src/cli/scope.ts";
import { withTempProject } from "../helpers/project.ts";

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
          "run `dekc lint demo --visual` to measure overflow and contrast",
        );
      },
    );
  });
});
