import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { newCommand } from "../../src/cli/new.ts";
import { DekError } from "../../src/core/error.ts";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { withTempDir } from "../helpers/fs.ts";
import { withTempProject } from "../helpers/project.ts";

type NewOk = {
  ok: true;
  name: string;
  dir: string;
  created: string[];
};

describe("dek new", () => {
  test("adds a deck and copies the project theme.css", async () => {
    await withTempProject(
      {
        theme: "/* project theme */\n",
        decks: [{ name: "demo", theme: "/* project theme */\n" }],
      },
      async (root) => {
        const result = await runDek(["new", "2026-09-dek", "--json"], { cwd: root });
        expect(result.exitCode).toBe(0);

        const json = jsonStdout<NewOk>(result);
        expect(json.ok).toBe(true);
        expect(json.name).toBe("2026-09-dek");
        expect(json.dir).toBe(join(root, "decks", "2026-09-dek"));

        expect(existsSync(join(root, "decks", "2026-09-dek", "script.md"))).toBe(true);
        expect(existsSync(join(root, "decks", "2026-09-dek", "slides"))).toBe(true);
        expect(await readFile(join(root, "decks", "2026-09-dek", "theme.css"), "utf8")).toBe(
          "/* project theme */\n",
        );
      },
    );
  });
});

describe("newCommand", () => {
  test("copies theme.css from themeFrom", async () => {
    await withTempProject(
      {
        theme: "/* project */\n",
        decks: [{ name: "old", theme: "/* from-old */\n" }],
      },
      async (root) => {
        newCommand({ cwd: root, name: "2026-09-dek", themeFrom: "old" });
        expect(await readFile(join(root, "decks", "2026-09-dek", "theme.css"), "utf8")).toBe(
          "/* from-old */\n",
        );
      },
    );
  });

  test("fails on a name with path separators", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      expect(() => newCommand({ cwd: root, name: "../evil" })).toThrow(DekError);
      try {
        newCommand({ cwd: root, name: "../evil" });
      } catch (error) {
        expect(error).toBeInstanceOf(DekError);
        expect((error as DekError).message).toContain("invalid deck name");
      }
    });
  });

  test("fails outside a project and points to dek init", async () => {
    await withTempDir(async (dir) => {
      expect(() => newCommand({ cwd: dir, name: "demo" })).toThrow(DekError);
      try {
        newCommand({ cwd: dir, name: "demo" });
      } catch (error) {
        expect(error).toBeInstanceOf(DekError);
        expect(`${(error as DekError).message} ${(error as DekError).hint ?? ""}`).toContain(
          "dek init",
        );
      }
    });
  });
});
