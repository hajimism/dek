import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  inferDeckName,
  peelDeckArg,
  requireDeckFromCwd,
  requireSection,
  resolveDecks,
  resolveScope,
} from "../../src/cli/scope.ts";
import { DekError, resolveProject } from "../../src/core/index.ts";
import { withTempProject } from "../helpers/project.ts";

describe("inferDeckName", () => {
  test("returns a failed deck when cwd is inside it", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      await writeFile(join(root, "decks", "demo", "script.md"), "this is not a deck\n");
      const project = resolveProject(root);
      expect(project.decks).toEqual([]);
      expect(inferDeckName(project, join(root, "decks", "demo"))).toBe("demo");
      expect(inferDeckName(project, join(root, "decks", "demo", "slides"))).toBe("demo");
    });
  });

  test("returns undefined from the project root", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const project = resolveProject(root);
      expect(inferDeckName(project, root)).toBeUndefined();
    });
  });
});

describe("resolveScope", () => {
  test("surfaces the parse error when cwd is a broken deck", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      await writeFile(join(root, "decks", "demo", "script.md"), "this is not a deck\n");
      expect(() => resolveScope(join(root, "decks", "demo"))).toThrow(DekError);
      try {
        resolveScope(join(root, "decks", "demo"));
      } catch (error) {
        expect(error).toBeInstanceOf(DekError);
        expect((error as DekError).message).toContain("frontmatter");
      }
    });
  });
});

describe("requireDeckFromCwd", () => {
  test("returns the deck when cwd is inside it", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const { deck } = requireDeckFromCwd(join(root, "decks", "demo"));
      expect(deck.name).toBe("demo");
    });
  });

  test("throws from the project root without --deck", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      expect(() => requireDeckFromCwd(root)).toThrow(DekError);
      try {
        requireDeckFromCwd(root);
      } catch (error) {
        expect(error).toBeInstanceOf(DekError);
        expect((error as DekError).message).toBe("not inside a deck directory; pass a deck name");
        expect((error as DekError).hint).toBe("pass a deck name or --deck <name>");
      }
    });
  });

  test("returns the named deck from the project root", async () => {
    await withTempProject({ decks: [{ name: "demo" }, { name: "other" }] }, async (root) => {
      const { deck } = requireDeckFromCwd(root, "other");
      expect(deck.name).toBe("other");
    });
  });
});

describe("requireSection", () => {
  test("returns the matching section", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const { deck } = requireDeckFromCwd(join(root, "decks", "demo"));
      const section = requireSection(deck, "intro");
      expect(section.slug).toBe("intro");
    });
  });

  test("throws when the slug is missing", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const { deck } = requireDeckFromCwd(join(root, "decks", "demo"));
      expect(() => requireSection(deck, "missing")).toThrow(DekError);
      try {
        requireSection(deck, "missing");
      } catch (error) {
        expect(error).toBeInstanceOf(DekError);
        expect((error as DekError).message).toBe('section "missing" not found');
        expect((error as DekError).path).toBe(deck.scriptPath);
        expect((error as DekError).hint).toBe("run `dek ls`");
      }
    });
  });
});

describe("resolveDecks", () => {
  test("includes the scoped deck when cwd is inside it", async () => {
    await withTempProject({ decks: [{ name: "alpha" }, { name: "beta" }] }, async (root) => {
      const result = resolveDecks(join(root, "decks", "beta"));
      expect(result.deck?.name).toBe("beta");
      expect(result.decks.map((deck) => deck.name)).toEqual(["beta"]);
    });
  });

  test("omits deck at the project root", async () => {
    await withTempProject({ decks: [{ name: "alpha" }, { name: "beta" }] }, async (root) => {
      const result = resolveDecks(root);
      expect(result.deck).toBeUndefined();
      expect(result.decks.map((deck) => deck.name)).toEqual(["alpha", "beta"]);
    });
  });
});

describe("peelDeckArg", () => {
  test("takes a positional deck for lint from the project root", async () => {
    await withTempProject({ decks: [{ name: "alpha" }, { name: "beta" }] }, async (root) => {
      expect(peelDeckArg(root, { command: "lint", args: ["beta"] })).toEqual({
        deck: "beta",
        rest: [],
      });
    });
  });

  test("keeps --deck and leaves remaining args alone", async () => {
    await withTempProject({ decks: [{ name: "alpha" }, { name: "beta" }] }, async (root) => {
      expect(peelDeckArg(root, { command: "show", deck: "beta", args: ["intro"] })).toEqual({
        deck: "beta",
        rest: ["intro"],
      });
    });
  });

  test("peels a known deck before a slug from the project root", async () => {
    await withTempProject({ decks: [{ name: "alpha" }, { name: "beta" }] }, async (root) => {
      expect(peelDeckArg(root, { command: "show", args: ["beta", "intro"] })).toEqual({
        deck: "beta",
        rest: ["intro"],
      });
      expect(peelDeckArg(root, { command: "shot", args: ["beta"] })).toEqual({
        deck: "beta",
        rest: [],
      });
    });
  });

  test("does not steal a slug when cwd is already a deck", async () => {
    await withTempProject({ decks: [{ name: "intro" }, { name: "demo" }] }, async (root) => {
      expect(
        peelDeckArg(join(root, "decks", "demo"), { command: "shot", args: ["intro"] }),
      ).toEqual({ rest: ["intro"] });
    });
  });

  test("does not treat voice subcommands as deck names", async () => {
    await withTempProject({ decks: [{ name: "demo" }, { name: "speakers" }] }, async (root) => {
      expect(peelDeckArg(root, { command: "voice", args: ["speakers"] })).toEqual({
        rest: ["speakers"],
      });
      expect(peelDeckArg(root, { command: "voice", args: ["demo", "say", "hello"] })).toEqual({
        deck: "demo",
        rest: ["say", "hello"],
      });
    });
  });

  test("peels mv only when a deck plus two slugs are present", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      expect(peelDeckArg(root, { command: "mv", args: ["demo", "old", "new"] })).toEqual({
        deck: "demo",
        rest: ["old", "new"],
      });
      expect(
        peelDeckArg(root, {
          command: "mv",
          args: ["demo", "architecture"],
          before: "intro",
        }),
      ).toEqual({ deck: "demo", rest: ["architecture"] });
      expect(peelDeckArg(root, { command: "mv", args: ["architecture", "intro"] })).toEqual({
        rest: ["architecture", "intro"],
      });
    });
  });
});
