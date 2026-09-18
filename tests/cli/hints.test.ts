import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { withTempDir } from "../helpers/fs.ts";
import { withTempProject } from "../helpers/project.ts";

type ErrorJson = {
  ok: false;
  error: { message: string; path?: string; hint?: string };
};

describe("dek error hints", () => {
  test("tells the next command outside a project", async () => {
    await withTempDir(async (dir) => {
      const result = await runDek(["ls", "--json"], { cwd: dir });
      expect(result.exitCode).toBe(1);
      const json = jsonStdout<ErrorJson>(result);
      expect(json.error.hint).toContain("dek init");
    });
  });

  test("tells the next command when a deck-scoped command runs at the project root", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const result = await runDek(["show", "intro", "--json"], { cwd: root });
      expect(result.exitCode).toBe(1);
      const json = jsonStdout<ErrorJson>(result);
      expect(json.error.hint).toContain("--deck");
    });
  });

  test("points unknown commands at help --agent", async () => {
    const result = await runDek(["nope", "--json"]);
    expect(result.exitCode).toBe(1);
    const json = jsonStdout<ErrorJson>(result);
    expect(json.error.hint).toContain("dek help --agent");
  });

  test("repeats usage as the hint when show has no slug", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const result = await runDek(["show", "--json"], { cwd: join(root, "decks", "demo") });
      expect(result.exitCode).toBe(1);
      const json = jsonStdout<ErrorJson>(result);
      expect(json.error.hint).toContain("dek show <slug>");
    });
  });

  test("repeats usage as the hint when mv has no slug", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const result = await runDek(["mv", "--json"], { cwd: join(root, "decks", "demo") });
      expect(result.exitCode).toBe(1);
      const json = jsonStdout<ErrorJson>(result);
      expect(json.error.hint).toContain("dek mv");
    });
  });

  test("suggests dek ls when a section is missing", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const result = await runDek(["show", "missing", "--json"], {
        cwd: join(root, "decks", "demo"),
      });
      expect(result.exitCode).toBe(1);
      const json = jsonStdout<ErrorJson>(result);
      expect(json.error.hint).toContain("dek ls");
    });
  });

  test("suggests dek ls when a deck is missing", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const result = await runDek(["show", "intro", "--deck", "nope", "--json"], { cwd: root });
      expect(result.exitCode).toBe(1);
      const json = jsonStdout<ErrorJson>(result);
      expect(json.error.hint).toContain("dek ls");
    });
  });

  test("repeats usage as the hint when new has no name", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const result = await runDek(["new", "--json"], { cwd: root });
      expect(result.exitCode).toBe(1);
      const json = jsonStdout<ErrorJson>(result);
      expect(json.error.hint).toContain("dek new <name>");
    });
  });
});
