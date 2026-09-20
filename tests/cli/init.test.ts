import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { initCommand } from "../../src/cli/init.ts";
import { DekError } from "../../src/core/error.ts";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { withTempDir } from "../helpers/fs.ts";

type InitOk = {
  ok: true;
  root: string;
  created: string[];
};

describe("dek init", () => {
  test("creates a project and returns JSON", async () => {
    await withTempDir(async (dir) => {
      const target = join(dir, "my-talks");
      const result = await runDek(["init", target, "--json"]);
      expect(result.exitCode).toBe(0);
      const json = jsonStdout<InitOk>(result);
      expect(json.ok).toBe(true);
      expect(json.root).toBe(target);
    });
  });
});

describe("initCommand", () => {
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
