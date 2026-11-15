import { describe, expect, test } from "bun:test";
import {
  excerpt,
  findMatches,
  isSearchKey,
  type SearchSource,
  searchDeck,
} from "../../src/runtime/search.ts";

const bare = { altKey: false, ctrlKey: false, metaKey: false };

describe("isSearchKey", () => {
  test("is a bare slash, Shift allowed for layouts that type it with Shift", () => {
    expect(isSearchKey({ key: "/", ...bare })).toBe(true);
    expect(isSearchKey({ key: "/", ...bare, shiftKey: true })).toBe(true);
  });

  test("leaves chords, auto-repeat and other keys alone", () => {
    expect(isSearchKey({ key: "/", ...bare, ctrlKey: true })).toBe(false);
    expect(isSearchKey({ key: "/", ...bare, metaKey: true })).toBe(false);
    expect(isSearchKey({ key: "/", ...bare, altKey: true })).toBe(false);
    expect(isSearchKey({ key: "/", ...bare, repeat: true })).toBe(false);
    expect(isSearchKey({ key: "?", ...bare })).toBe(false);
  });
});

describe("findMatches", () => {
  test("finds every place, ignoring case", () => {
    expect(findMatches("Bun runs bun", "BUN")).toEqual([
      [0, 3],
      [9, 12],
    ]);
  });

  test("reads full-width and half-width forms as one", () => {
    expect(findMatches("ＤＥＫで作る", "dek")).toEqual([[0, 3]]);
    expect(findMatches("ﾃﾞｯｸ", "デック")).toEqual([[0, 4]]);
    expect(findMatches("デック", "ﾃﾞｯｸ")).toEqual([[0, 3]]);
  });

  test("passes over spaces and line breaks, as a sentence broken across lines reads", () => {
    expect(findMatches("ビルド\n  システム", "ビルドシステム")).toEqual([[0, 10]]);
    expect(findMatches("build system", "build  system")).toEqual([[0, 12]]);
  });

  test("finds nothing for a query of spaces alone", () => {
    expect(findMatches("a b", "  ")).toEqual([]);
  });

  test("keeps a character outside the basic plane whole", () => {
    expect(findMatches("x🍣y", "🍣")).toEqual([[1, 3]]);
  });
});

describe("excerpt", () => {
  test("shows a short text whole around its match", () => {
    expect(excerpt("say hello there", 4, 9)).toEqual({
      lead: "say ",
      match: "hello",
      tail: " there",
    });
  });

  test("cuts a long text before and after the match, and says so", () => {
    const text = `${"a".repeat(100)}MATCH${"b".repeat(200)}`;
    const cut = excerpt(text, 100, 105);
    expect(cut.lead).toBe(`…${"a".repeat(24)}`);
    expect(cut.match).toBe("MATCH");
    expect(cut.tail).toBe(`${"b".repeat(80)}…`);
  });
});

describe("searchDeck", () => {
  const sources: SearchSource[] = [
    { slideIndex: 0, kind: "title", text: "Intro" },
    { slideIndex: 0, kind: "slide", text: "Welcome to dek" },
    { slideIndex: 1, kind: "title", text: "Steps" },
    {
      slideIndex: 1,
      kind: "slide",
      text: "dek one dek two",
      // "dek one" shows at beat 2, "dek two" at beat 1.
      beats: [2, 2, 2, 2, 2, 2, 2, 0, 1, 1, 1, 1, 1, 1, 1],
    },
    { slideIndex: 1, kind: "script", text: "Say dek here." },
    { slideIndex: 2, kind: "title", text: "About dek" },
    { slideIndex: 2, kind: "script", text: "The dek story." },
    { slideIndex: 3, kind: "title", text: "End" },
  ];

  test("gives one hit a slide, in the deck's order, counting the matches on it and in its script", () => {
    const hits = searchDeck(sources, "dek");
    expect(hits.map((hit) => [hit.slideIndex, hit.count])).toEqual([
      [0, 1],
      [1, 3],
      [2, 1],
    ]);
  });

  test("goes to the earliest beat that shows a match", () => {
    const [, steps] = searchDeck(sources, "dek");
    expect(steps?.beatIndex).toBe(1);
    expect(steps?.snippet).toEqual({ kind: "slide", text: "dek one dek two", start: 8, end: 11 });
  });

  test("quotes the script where the slide does not say it, and arrives at the slide", () => {
    const about = searchDeck(sources, "story");
    expect(about).toEqual([
      {
        slideIndex: 2,
        beatIndex: 0,
        count: 1,
        snippet: { kind: "script", text: "The dek story.", start: 8, end: 13 },
      },
    ]);
  });

  test("finds a slide by its title alone, with nothing to quote", () => {
    expect(searchDeck(sources, "end")).toEqual([{ slideIndex: 3, beatIndex: 0, count: 0 }]);
  });

  test("finds nothing for an empty query", () => {
    expect(searchDeck(sources, " ")).toEqual([]);
  });
});
