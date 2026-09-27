import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { formatError } from "../../src/cli/format.ts";
import { lsCommand } from "../../src/cli/ls.ts";
import { resolveTarget } from "../../src/cli/scope.ts";
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
      expect(errorOf(() => lsCommand(resolveTarget(dir, "decks", { refs: true }))).hint).toContain(
        "dek init",
      );
    });
  });

  test("tells the next command when a deck-scoped command runs at the project root", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      expect(
        errorOf(() => showCommand(resolveTarget(root, "deck", { refs: true }), "intro")).hint,
      ).toContain("--deck");
    });
  });

  test("suggests dek ls when a section is missing", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const cwd = join(root, "decks", "demo");
      expect(
        errorOf(() => showCommand(resolveTarget(cwd, "deck", { refs: true }), "missing")).hint,
      ).toContain("dek ls");
    });
  });

  test("suggests dek ls when a deck is missing", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const error = errorOf(() =>
        showCommand(resolveTarget(root, "deck", { refs: true, deck: "nope" }), "intro"),
      );
      expect(error.hint).toContain("dek ls");
    });
  });
});
