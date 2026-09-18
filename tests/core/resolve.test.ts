import { describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DekError, resolveDeck, resolveProject } from "../../src/core/index.ts";
import { withTempDir } from "../helpers/fs.ts";
import { projectFixturesDir } from "../helpers/paths.ts";

const simpleRoot = realpathSync(join(projectFixturesDir, "simple"));

describe("resolveProject", () => {
  test("walks up from a deck directory to dek.toml", () => {
    const project = resolveProject(join(simpleRoot, "decks", "demo"));
    expect(project.root).toBe(simpleRoot);
    expect(project.configPath).toBe(join(simpleRoot, "dek.toml"));
  });

  test("walks up from slides/ as well", () => {
    const project = resolveProject(join(simpleRoot, "decks", "demo", "slides"));
    expect(project.root).toBe(simpleRoot);
  });

  test("loads decks/<name>/script.md", () => {
    const project = resolveProject(simpleRoot);
    expect(project.decks).toHaveLength(1);
    expect(project.decks[0]?.name).toBe("demo");
    expect(project.decks[0]?.dir).toBe(join(simpleRoot, "decks", "demo"));
    expect(project.decks[0]?.scriptPath).toBe(join(simpleRoot, "decks", "demo", "script.md"));
    expect(project.decks[0]?.deck.title).toBe("Demo");
    expect(project.decks[0]?.deck.sections[0]?.slug).toBe("intro");
  });

  test("returns an empty decks list when decks/ is empty", async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, "dek.toml"), "# empty\n");
      await mkdir(join(dir, "decks"));
      const project = resolveProject(dir);
      expect(project.root).toBe(dir);
      expect(project.decks).toEqual([]);
    });
  });

  test("errors when dek.toml is not found", async () => {
    await withTempDir(async (dir) => {
      expect(() => resolveProject(dir)).toThrow(DekError);
    });
  });

  test("skips a deck directory with no script.md", async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, "dek.toml"), "# empty\n");
      await mkdir(join(dir, "decks", "orphan"), { recursive: true });
      await mkdir(join(dir, "decks", "demo"), { recursive: true });
      await writeFile(
        join(dir, "decks", "demo", "script.md"),
        `---
title: Demo
---

## intro

hello
`,
      );
      const project = resolveProject(dir);
      expect(project.decks).toHaveLength(1);
      expect(project.decks[0]?.name).toBe("demo");
      expect(project.failed).toHaveLength(1);
      expect(project.failed[0]?.name).toBe("orphan");
      expect(project.failed[0]?.error).toBeInstanceOf(DekError);
    });
  });
});

describe("resolveDeck", () => {
  test("parses only the requested deck", async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, "dek.toml"), "# empty\n");
      await mkdir(join(dir, "decks", "alpha"), { recursive: true });
      await mkdir(join(dir, "decks", "beta"), { recursive: true });
      await writeFile(
        join(dir, "decks", "alpha", "script.md"),
        `---
title: Alpha
---

## intro

hello
`,
      );
      await writeFile(join(dir, "decks", "beta", "script.md"), "this is not a deck\n");
      const { project, deck } = resolveDeck(join(dir, "decks", "alpha"));
      expect(deck.name).toBe("alpha");
      expect(project.decks.map((entry) => entry.name)).toEqual(["alpha"]);
      expect(project.failed).toEqual([]);
    });
  });

  test("throws the parse error instead of 'not a deck directory'", async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, "dek.toml"), "# empty\n");
      await mkdir(join(dir, "decks", "demo"), { recursive: true });
      await writeFile(join(dir, "decks", "demo", "script.md"), "this is not a deck\n");
      expect(() => resolveDeck(join(dir, "decks", "demo"))).toThrow(DekError);
      try {
        resolveDeck(join(dir, "decks", "demo"));
      } catch (error) {
        expect(error).toBeInstanceOf(DekError);
        expect((error as DekError).message).not.toBe("not a deck directory");
        expect((error as DekError).message).toContain("frontmatter");
      }
    });
  });

  test("throws not a deck directory from the project root", async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, "dek.toml"), "# empty\n");
      await mkdir(join(dir, "decks"));
      expect(() => resolveDeck(dir)).toThrow("not a deck directory");
    });
  });
});
