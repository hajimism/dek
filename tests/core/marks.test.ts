import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DekcError } from "../../src/core/error.ts";
import {
  clearMarks,
  listMarks,
  markedPositions,
  marksPath,
  toggleMark,
} from "../../src/core/marks.ts";
import { resolveDeck } from "../../src/core/resolve.ts";
import { withTempProject } from "../helpers/project.ts";

const script = `---
title: Marks
---

## intro

今日は三つ話します。

### first

一つ目です。

### second

二つ目です。

## outro

おわり。
`;

const spec = {
  decks: [
    { name: "demo", script },
    { name: "other", script },
  ],
};
const at = (slideIndex: number, beatIndex: number) => ({ slideIndex, beatIndex });
const NOW = new Date("2026-09-28T10:00:00.000Z");

describe("marks", () => {
  test("marks the beat on screen, and unmarks it at the second press", async () => {
    await withTempProject(spec, async (root) => {
      const { deck } = resolveDeck(join(root, "decks", "demo"));
      expect(toggleMark(root, deck, at(0, 2), NOW)).toEqual({
        marked: true,
        positions: [at(0, 2)],
      });
      expect(toggleMark(root, deck, at(1, 0), NOW)).toEqual({
        marked: true,
        positions: [at(0, 2), at(1, 0)],
      });
      expect(toggleMark(root, deck, at(0, 2), NOW)).toEqual({
        marked: false,
        positions: [at(1, 0)],
      });
      expect(existsSync(marksPath(root))).toBe(true);
    });
  });

  test("lists each mark where the script has it now, with the words as they were marked", async () => {
    await withTempProject(spec, async (root) => {
      const { deck } = resolveDeck(join(root, "decks", "demo"));
      toggleMark(root, deck, at(0, 0), NOW);
      toggleMark(root, deck, at(0, 2), NOW);
      expect(listMarks(root, deck)).toEqual([
        {
          slug: "intro",
          beat: null,
          beatIndex: 0,
          line: 5,
          path: join(root, "decks", "demo", "script.md"),
          status: "open",
          was: "今日は三つ話します。",
          text: "今日は三つ話します。",
          markedAt: NOW.toISOString(),
        },
        {
          slug: "intro",
          beat: "second",
          beatIndex: 2,
          line: 13,
          path: join(root, "decks", "demo", "script.md"),
          status: "open",
          was: "二つ目です。",
          text: "二つ目です。",
          markedAt: NOW.toISOString(),
        },
      ]);
    });
  });

  test("follows its beat when beats are added before it, and says once it was rewritten", async () => {
    await withTempProject(spec, async (root) => {
      const dir = join(root, "decks", "demo");
      toggleMark(root, resolveDeck(dir).deck, at(0, 2), NOW);
      await writeFile(
        join(dir, "script.md"),
        script
          .replace("### first", "### zero\n\n零です。\n\n### first")
          .replace("二つ目です。", "二つ目は、言い直しました。"),
      );
      const { deck } = resolveDeck(dir);
      expect(listMarks(root, deck)).toMatchObject([
        {
          beat: "second",
          beatIndex: 3,
          status: "edited",
          was: "二つ目です。",
          text: "二つ目は、言い直しました。",
        },
      ]);
      expect(markedPositions(root, deck)).toEqual([at(0, 3)]);
    });
  });

  test("keeps a mark whose beat is gone, so the note is not lost with it", async () => {
    await withTempProject(spec, async (root) => {
      const dir = join(root, "decks", "demo");
      toggleMark(root, resolveDeck(dir).deck, at(0, 1), NOW);
      await writeFile(join(dir, "script.md"), script.replace("### first\n\n一つ目です。\n\n", ""));
      const { deck } = resolveDeck(dir);
      expect(listMarks(root, deck)).toMatchObject([
        { slug: "intro", beat: "first", beatIndex: null, line: null, status: "gone", text: null },
      ]);
      expect(markedPositions(root, deck)).toEqual([]);
    });
  });

  test("keeps each deck's marks apart, and clears one deck's alone", async () => {
    await withTempProject(spec, async (root) => {
      const demo = resolveDeck(join(root, "decks", "demo")).deck;
      const other = resolveDeck(join(root, "decks", "other")).deck;
      toggleMark(root, demo, at(0, 1), NOW);
      toggleMark(root, demo, at(1, 0), NOW);
      toggleMark(root, other, at(1, 0), NOW);
      expect(clearMarks(root, demo)).toBe(2);
      expect(listMarks(root, demo)).toEqual([]);
      expect(listMarks(root, other)).toHaveLength(1);
      expect(clearMarks(root, demo)).toBe(0);
    });
  });

  test("marks nothing past the deck", async () => {
    await withTempProject(spec, async (root) => {
      const { deck } = resolveDeck(join(root, "decks", "demo"));
      expect(() => toggleMark(root, deck, at(0, 3), NOW)).toThrow(DekcError);
      expect(() => toggleMark(root, deck, at(2, 0), NOW)).toThrow(DekcError);
      expect(existsSync(marksPath(root))).toBe(false);
    });
  });

  test("says how to start over from a marks file it cannot read", async () => {
    await withTempProject(spec, async (root) => {
      const { deck } = resolveDeck(join(root, "decks", "demo"));
      toggleMark(root, deck, at(0, 1), NOW);
      await writeFile(marksPath(root), "{ not json");
      expect(() => listMarks(root, deck)).toThrow(/marks\.json/);
      try {
        listMarks(root, deck);
      } catch (error) {
        expect((error as DekcError).hint).toContain("delete .dekc/marks.json");
      }
      expect(await readFile(marksPath(root), "utf8")).toBe("{ not json");
    });
  });
});
