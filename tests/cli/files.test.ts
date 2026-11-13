import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultGitignore, defaultScript, ignoreLocalState } from "../../src/cli/files.ts";
import { parseScript } from "../../src/core/parse.ts";
import { withTempDir } from "../helpers/fs.ts";

describe("defaultScript", () => {
  test("quotes titles that would break YAML", () => {
    const title = "Meetup: #42";
    const source = defaultScript(title);
    expect(source).toContain(`title: ${JSON.stringify(title)}`);
    const deck = parseScript(source);
    expect(deck.title).toBe(title);
  });
});

describe("the .gitignore dek writes", () => {
  /** Which of `paths` git ignores in `root`. */
  function ignored(root: string, paths: string[]): string[] {
    Bun.spawnSync(["git", "init", "-q"], { cwd: root, stdin: "ignore" });
    const result = Bun.spawnSync(["git", "check-ignore", ...paths], { cwd: root, stdin: "ignore" });
    return result.stdout.toString().split("\n").filter(Boolean);
  }

  // dek.pub moves comments by the renames, from whichever checkout publishes, so they are
  // committed with the project, as .dek/schema.json and .dek/slide.d.ts are.
  test("ignores what dek keeps while it runs, and keeps .dek/renames.json", async () => {
    await withTempDir(async (root) => {
      writeFileSync(join(root, ".gitignore"), defaultGitignore());
      expect(
        ignored(root, [
          ".dek/server.json",
          ".dek/marks.json",
          ".dek/annotations.json",
          ".dek/renames.json",
          ".dek/schema.json",
        ]),
      ).toEqual([".dek/server.json", ".dek/marks.json", ".dek/annotations.json"]);
    });
  });

  test("brings an older .gitignore up to date without ignoring .dek/renames.json", async () => {
    await withTempDir(async (root) => {
      mkdirSync(join(root, ".dek"));
      writeFileSync(join(root, ".gitignore"), "dist/\n");
      expect(ignoreLocalState(root)).toBe(true);
      expect(ignored(root, [".dek/annotations.json", ".dek/renames.json"])).toEqual([
        ".dek/annotations.json",
      ]);
    });
  });
});
