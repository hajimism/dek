import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { clearMarksCommand, marksCommand } from "../../src/cli/marks.ts";
import { displayPaths, formatText } from "../../src/cli/result.ts";
import { resolveTarget } from "../../src/cli/scope.ts";
import { toggleMark } from "../../src/core/marks.ts";
import { resolveDeck } from "../../src/core/resolve.ts";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { withTempProject } from "../helpers/project.ts";

const script = `---
title: Marks
---

## intro

今日は三つ話します。

### second

二つ目です。
`;

const spec = { decks: [{ name: "demo", script }] };

/** Marks as the presenter view leaves them: the arrival of intro, then its beat. */
function markBoth(root: string): void {
  const { deck } = resolveDeck(join(root, "decks", "demo"));
  toggleMark(root, deck, { slideIndex: 0, beatIndex: 0 });
  toggleMark(root, deck, { slideIndex: 0, beatIndex: 1 });
}

const target = (root: string) => resolveTarget(join(root, "decks", "demo"), "deck", {});

describe("dekc marks", () => {
  test("lists each marked beat by its place in script.md, from the project root too", async () => {
    await withTempProject(spec, async (root) => {
      markBoth(root);
      await writeFile(
        join(root, "decks", "demo", "script.md"),
        script.replace("二つ目です。", "二つ目を言い直す。"),
      );
      const result = await runDek(["marks", "demo", "--json"], { cwd: root });
      expect(result.exitCode).toBe(0);
      expect(jsonStdout(result)).toMatchObject({
        ok: true,
        action: "list",
        marks: [
          { slug: "intro", beat: null, line: 5, path: "decks/demo/script.md", status: "open" },
          {
            slug: "intro",
            beat: "second",
            beatIndex: 1,
            line: 9,
            status: "edited",
            was: "二つ目です。",
            text: "二つ目を言い直す。",
          },
        ],
      });
    });
  });

  test("prints each mark at its line, the way an editor jumps to it", async () => {
    await withTempProject(spec, async (root) => {
      markBoth(root);
      const deckDir = join(root, "decks", "demo");
      const data = await marksCommand(target(root));
      expect(formatText(displayPaths({ command: "marks", data }, deckDir))).toBe(
        [
          "script.md:5  intro",
          "  今日は三つ話します。",
          "script.md:9  intro › second",
          "  二つ目です。",
        ].join("\n"),
      );
    });
  });

  test("says when nothing is marked, and names the key that marks", async () => {
    await withTempProject(spec, async (root) => {
      const data = await marksCommand(target(root));
      expect(formatText({ command: "marks", data })).toBe(
        "no marks: press m in the presenter view to mark a beat",
      );
    });
  });

  test("clear drops the deck's marks and says how many", async () => {
    await withTempProject(spec, async (root) => {
      markBoth(root);
      const cleared = await clearMarksCommand(target(root));
      expect(cleared).toEqual({ action: "clear", cleared: 2 });
      expect(formatText({ command: "marks", data: cleared })).toBe("cleared 2 marks");
      expect(await marksCommand(target(root))).toEqual({ action: "list", marks: [] });
    });
  });
});
