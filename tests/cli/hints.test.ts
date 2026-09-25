import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { formatError } from "../../src/cli/format.ts";
import { lsCommand } from "../../src/cli/ls.ts";
import { mvCommand } from "../../src/cli/mv.ts";
import { newCommand } from "../../src/cli/new.ts";
import { showCommand } from "../../src/cli/show.ts";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { withTempDir } from "../helpers/fs.ts";
import { withTempProject } from "../helpers/project.ts";

type ErrorJson = {
  ok: false;
  error: { message: string; path?: string; hint?: string };
};

/** What `--json` prints for the error a command throws. */
function errorOf(run: () => unknown): ErrorJson["error"] {
  try {
    run();
  } catch (error) {
    return formatError(error);
  }
  throw new Error("expected the command to fail");
}

describe("dek error hints", () => {
  // One run through the real binary: the error reaches stdout as JSON with a failing exit.
  test("suggests the command a typo was probably meant to be", async () => {
    const result = await runDek(["biuld", "--json"]);
    expect(result).toMatchObject({ exitCode: 1 });
    const json = jsonStdout<ErrorJson>(result);
    expect(json.ok).toBe(false);
    expect(json.error.hint).toBe("did you mean `dek build`?");
  });

  test("tells the next command outside a project", async () => {
    await withTempDir(async (dir) => {
      expect(errorOf(() => lsCommand({ cwd: dir })).hint).toContain("dek init");
    });
  });

  test("tells the next command when a deck-scoped command runs at the project root", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      expect(errorOf(() => showCommand({ cwd: root, slug: "intro" })).hint).toContain("--deck");
    });
  });

  test("points at dek ls when show has no slug", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const error = errorOf(() => showCommand({ cwd: join(root, "decks", "demo") }));
      expect(error.message).toBe("usage: dek show <slug>");
      expect(error.hint).toBe("run `dek ls` to see the slugs");
    });
  });

  test("gives an example when mv has no slug", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      expect(errorOf(() => mvCommand({ cwd: join(root, "decks", "demo") })).hint).toBe(
        "for example, `dek mv intro opening` or `dek mv intro --after agenda`",
      );
    });
  });

  test("suggests dek ls when a section is missing", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const cwd = join(root, "decks", "demo");
      expect(errorOf(() => showCommand({ cwd, slug: "missing" })).hint).toContain("dek ls");
    });
  });

  test("suggests dek ls when a deck is missing", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const error = errorOf(() => showCommand({ cwd: root, slug: "intro", deck: "nope" }));
      expect(error.hint).toContain("dek ls");
    });
  });

  test("gives an example when new has no name", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const error = errorOf(() => newCommand({ cwd: root }));
      expect(error.message).toBe("usage: dek new <name>");
      expect(error.hint).toBe("for example, `dek new 2026-10-talk`");
    });
  });
});
