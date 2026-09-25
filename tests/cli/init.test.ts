import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { initCommand } from "../../src/cli/init.ts";
import { type LsDeckResult, lsCommand } from "../../src/cli/ls.ts";
import { DekError } from "../../src/core/error.ts";
import { lintDeck } from "../../src/core/index.ts";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { withTempDir } from "../helpers/fs.ts";

type InitOk = {
  ok: true;
  root: string;
  created: string[];
  kept: string[];
};

describe("dek init", () => {
  test("creates a project and returns JSON", async () => {
    await withTempDir(async (dir) => {
      const target = join(dir, "my-talks");
      const result = await runDek(["init", target, "--json"], { cwd: dir });
      expect(result).toMatchObject({ exitCode: 0 });
      const json = jsonStdout<InitOk>(result);
      expect(json.ok).toBe(true);
      expect(json.root).toBe(target);
      expect(json.created).toContain("my-talks/dek.toml");
      expect(json.kept).toEqual([]);
    });
  });
});

describe("initCommand", () => {
  test("names next commands that run as printed, installing dek first when it is not local", async () => {
    await withTempDir(async (dir) => {
      expect(initCommand({ cwd: dir, dir: "my-talks", deck: "demo" }).next).toEqual([
        "cd my-talks",
        "bun add -d github:hajimism/dek",
        "cd decks/demo",
        "$EDITOR script.md",
        "bunx dek",
      ]);
      expect(initCommand({ cwd: dir, dir: "bare" }).next).toEqual([
        "cd bare",
        "bun add -d github:hajimism/dek",
        "bunx dek new <name>",
      ]);
      expect(initCommand({ cwd: join(dir, "bare") }).next).toEqual([
        "bun add -d github:hajimism/dek",
        "bunx dek new <name>",
      ]);
    });
  });

  test("skips the install step when the project already has dek in node_modules", async () => {
    await withTempDir(async (dir) => {
      await mkdir(join(dir, "node_modules", ".bin"), { recursive: true });
      await writeFile(join(dir, "node_modules", ".bin", "dek"), "");
      expect(initCommand({ cwd: dir, dir: "my-talks", deck: "demo" }).next).toEqual([
        "cd my-talks/decks/demo",
        "$EDITOR script.md",
        "bunx dek",
      ]);
    });
  });

  test("quotes a path with spaces for the shell", async () => {
    await withTempDir(async (dir) => {
      expect(initCommand({ cwd: dir, dir: "My Talks", deck: "it's" }).next).toEqual([
        "cd 'My Talks'",
        "bun add -d github:hajimism/dek",
        "cd 'decks/it'\\''s'",
        "$EDITOR script.md",
        "bunx dek",
      ]);
    });
  });

  test("changes into the absolute path when that is shorter than the relative one", async () => {
    await withTempDir(async (dir) => {
      const deep = join(dir, ...Array.from({ length: 40 }, () => "a"));
      expect(initCommand({ cwd: deep, dir: join(dir, "talks") }).next[0]).toBe(
        `cd ${join(dir, "talks")}`,
      );
    });
  });

  test("checks every input before it writes anything", async () => {
    await withTempDir(async (dir) => {
      const target = join(dir, "newproj");
      expect(() => initCommand({ cwd: dir, dir: target, deck: "bad/name" })).toThrow(
        "invalid deck name",
      );
      expect(existsSync(target)).toBe(false);
    });
  });

  test("checks the files dek refreshes, too, before it writes anything", async () => {
    await withTempDir(async (dir) => {
      const target = join(dir, "newproj");
      await mkdir(join(target, "AGENTS.md"), { recursive: true });
      try {
        initCommand({ cwd: dir, dir: target, deck: "demo" });
        throw new Error("expected init to refuse");
      } catch (error) {
        expect(error).toBeInstanceOf(DekError);
        expect((error as DekError).message).toBe("a directory is in the way of a file");
        expect((error as DekError).path).toBe(join(target, "AGENTS.md"));
      }
      expect(existsSync(join(target, "dek.toml"))).toBe(false);
    });
  });

  test("refuses to nest a project inside another, pointing at dek new", async () => {
    await withTempDir(async (dir) => {
      initCommand({ cwd: dir, deck: "talk" });
      const inner = join(dir, "decks", "talk2");
      try {
        initCommand({ cwd: inner });
        throw new Error("expected init to refuse");
      } catch (error) {
        expect(error).toBeInstanceOf(DekError);
        expect((error as DekError).message).toContain("inside the dek project");
        expect((error as DekError).hint).toContain("dek new talk2");
      }
      expect(existsSync(inner)).toBe(false);
    });
  });

  test("keeps every file that exists, and says so, when run again", async () => {
    await withTempDir(async (dir) => {
      const first = initCommand({ cwd: dir, deck: "demo" });
      expect(first.kept).toEqual([]);
      await writeFile(join(dir, "AGENTS.md"), "# my own notes\n");
      await writeFile(join(dir, "decks", "demo", "script.md"), "## mine\n");

      const again = initCommand({ cwd: dir, deck: "demo" });
      // AGENTS.md is shared: the author's notes stay, and dek's block follows them.
      const agents = await readFile(join(dir, "AGENTS.md"), "utf8");
      expect(agents.startsWith("# my own notes\n\n<!-- dek:begin")).toBe(true);
      expect(agents).toContain("dek help --agent");
      expect(await readFile(join(dir, "decks", "demo", "script.md"), "utf8")).toBe("## mine\n");
      expect(again.created).toEqual([]);
      expect(again.kept).toEqual([join(dir, "decks", "demo", "script.md")]);
    });
  });

  test("creates a first deck that already passes lint", async () => {
    await withTempDir(async (dir) => {
      const target = join(dir, "my-talks");
      const result = initCommand({ cwd: dir, dir: target, deck: "demo" });
      expect(result.created).toContain(join(target, "decks", "demo", "slides", "intro.html"));
      expect(lintDeck(join(target, "decks", "demo"))).toEqual([]);
    });
  });

  test("starts the first deck with a real script: sections, beats, a budget, an estimate", async () => {
    await withTempDir(async (dir) => {
      initCommand({ cwd: dir, deck: "demo" });
      const ls = lsCommand({ cwd: dir, positionalDeck: "demo" }) as LsDeckResult;
      expect(ls.duration).toBeDefined();
      expect(ls.estimateSeconds).toBeGreaterThan(0);
      expect(ls.sections.length).toBeGreaterThan(1);
      expect(ls.sections.some((section) => section.beats > 0)).toBe(true);
      expect(ls.diagnostics).toEqual([]);
    });
  });

  test("writes AGENTS.md with or without a first deck", async () => {
    await withTempDir(async (dir) => {
      for (const [name, deck] of [
        ["bare", undefined],
        ["with-deck", "demo"],
      ] as const) {
        const target = join(dir, name);
        const result = initCommand({ cwd: dir, dir: target, ...(deck ? { deck } : {}) });
        expect(result.created).toContain(join(target, "AGENTS.md"));
        expect(await readFile(join(target, "AGENTS.md"), "utf8")).toContain("dek help --agent");
      }
    });
  });

  test("creates a project with a first deck", async () => {
    await withTempDir(async (dir) => {
      const target = join(dir, "my-talks");
      const result = initCommand({ cwd: dir, dir: target, deck: "demo" });
      expect(result.root).toBe(target);

      expect(existsSync(join(target, "dek.toml"))).toBe(true);
      expect(existsSync(join(target, "theme.css"))).toBe(true);
      expect(existsSync(join(target, "assets"))).toBe(true);
      expect(existsSync(join(target, "decks"))).toBe(true);
      expect(existsSync(join(target, "decks", "demo", "script.md"))).toBe(true);
      expect(existsSync(join(target, "decks", "demo", "theme.css"))).toBe(true);
      expect(existsSync(join(target, "decks", "demo", "slides"))).toBe(true);
      expect(existsSync(join(target, "decks", "demo", "assets"))).toBe(true);
      expect(existsSync(join(target, ".dek", "schema.json"))).toBe(true);
      expect(existsSync(join(target, ".rumdl.toml"))).toBe(true);
      const rumdl = await readFile(join(target, ".rumdl.toml"), "utf8");
      expect(rumdl).toContain("MD041");
      expect(rumdl).not.toContain("MD013");

      const theme = await readFile(join(target, "theme.css"), "utf8");
      expect(theme).toContain(".slide");
    });
  });

  test("creates .gitignore that ignores dist, .cache, and the dev-server lock", async () => {
    await withTempDir(async (dir) => {
      const target = join(dir, "my-talks");
      const result = initCommand({ cwd: dir, dir: target });
      expect(result.created).toContain(join(target, ".gitignore"));
      const gitignore = await readFile(join(target, ".gitignore"), "utf8");
      expect(gitignore).toContain("dist/");
      expect(gitignore).toContain(".cache/");
      expect(gitignore).toContain(".dek/server.json");
      expect(gitignore).toContain("node_modules/");
      expect(gitignore).not.toContain("schema.json");
    });
  });

  test("does not overwrite an existing .gitignore", async () => {
    await withTempDir(async (dir) => {
      const target = join(dir, "my-talks");
      await mkdir(target, { recursive: true });
      await writeFile(join(target, ".gitignore"), "# mine\n");
      const result = initCommand({ cwd: dir, dir: target });
      expect(await readFile(join(target, ".gitignore"), "utf8")).toBe("# mine\n");
      expect(result.created).not.toContain(join(target, ".gitignore"));
    });
  });

  test("rejects a deck name with path separators", async () => {
    await withTempDir(async (dir) => {
      const target = join(dir, "my-talks");
      expect(() => initCommand({ cwd: dir, dir: target, deck: "../evil" })).toThrow(DekError);
      try {
        initCommand({ cwd: dir, dir: target, deck: "../evil" });
      } catch (error) {
        expect(error).toBeInstanceOf(DekError);
        expect((error as DekError).message).toContain("invalid deck name");
      }
      expect(existsSync(join(dir, "evil"))).toBe(false);
    });
  });

  test("always creates decks/ even without --deck", async () => {
    await withTempDir(async (dir) => {
      const target = join(dir, "my-talks");
      initCommand({ cwd: dir, dir: target });
      expect(existsSync(join(target, "decks"))).toBe(true);
      expect(existsSync(join(target, "dek.toml"))).toBe(true);
    });
  });

  test("does not overwrite an existing theme.css", async () => {
    await withTempDir(async (dir) => {
      const target = join(dir, "my-talks");
      await mkdir(target, { recursive: true });
      await writeFile(join(target, "theme.css"), "/* custom */\n");
      initCommand({ cwd: dir, dir: target });
      expect(await readFile(join(target, "theme.css"), "utf8")).toBe("/* custom */\n");
    });
  });

  test("uses cwd when dir is omitted", async () => {
    await withTempDir(async (dir) => {
      const result = initCommand({ cwd: dir });
      expect(result.root).toBe(dir);
      expect(existsSync(join(dir, "dek.toml"))).toBe(true);
    });
  });

  test.skipIf(!Bun.which("rumdl"))(
    "init script.md is clean under the shipped rumdl config",
    async () => {
      await withTempDir(async (dir) => {
        const target = join(dir, "my-talks");
        initCommand({ cwd: dir, dir: target, deck: "demo" });
        const proc = Bun.spawn(
          ["rumdl", "check", join(target, "decks", "demo", "script.md"), "--output-format", "json"],
          { cwd: target, stdout: "pipe", stderr: "pipe" },
        );
        const [stdout, exitCode] = await Promise.all([
          new Response(proc.stdout).text(),
          proc.exited,
        ]);
        expect(exitCode).toBe(0);
        expect(stdout.trim() === "" || stdout.trim() === "[]").toBe(true);
      });
    },
  );
});
