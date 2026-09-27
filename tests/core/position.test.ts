import { describe, expect, test } from "bun:test";
import {
  advance,
  clampPosition,
  comparePositions,
  deckStops,
  formatHash,
  hashChangeTarget,
  historyMode,
  moveTarget,
  positionFromHash,
  positionsEqual,
  retreat,
} from "../../src/core/position.ts";

const slugs = ["intro", "arch"];

/** A deck whose slides have these stop counts. */
const stops = (...counts: number[]) => counts.map((count) => ({ stops: count }));

describe("formatHash", () => {
  test("uses the slug and the beat reached when beatIndex is above 0", () => {
    expect(formatHash({ slideIndex: 1, beatIndex: 2 }, slugs)).toBe("#arch/2");
  });

  test("omits the beat when beatIndex is 0", () => {
    expect(formatHash({ slideIndex: 1, beatIndex: 0 }, slugs)).toBe("#arch");
  });
});

describe("positionFromHash reading the hash", () => {
  const deck = [
    { slug: "intro", stops: 1 },
    { slug: "arch", stops: 3 },
  ];

  test("round-trips formatHash", () => {
    const pos = { slideIndex: 1, beatIndex: 2 };
    expect(positionFromHash(formatHash(pos, slugs), deck)).toEqual(pos);
  });

  test("reads /0 as the slide's arrival and ignores a beat that is not a whole number", () => {
    expect(positionFromHash("#arch/0", deck)).toEqual({ slideIndex: 1, beatIndex: 0 });
    expect(positionFromHash("#arch/1.5", deck)).toEqual({ slideIndex: 1, beatIndex: 0 });
  });

  test("returns the first slide for an unknown slug or empty hash", () => {
    expect(positionFromHash("#missing", deck)).toEqual({ slideIndex: 0, beatIndex: 0 });
    expect(positionFromHash("", deck)).toEqual({ slideIndex: 0, beatIndex: 0 });
    expect(positionFromHash("#", deck)).toEqual({ slideIndex: 0, beatIndex: 0 });
  });
});

describe("clampPosition", () => {
  test("pins a slide past the last to the last slide's last beat", () => {
    expect(clampPosition({ slideIndex: 9, beatIndex: 0 }, stops(1, 3))).toEqual({
      slideIndex: 1,
      beatIndex: 2,
    });
  });

  test("clamps beatIndex to the last beat", () => {
    expect(clampPosition({ slideIndex: 0, beatIndex: 5 }, stops(2))).toEqual({
      slideIndex: 0,
      beatIndex: 1,
    });
  });

  test("names no position in a deck without slides", () => {
    expect(clampPosition({ slideIndex: 0, beatIndex: 0 }, [])).toBeUndefined();
  });
});

describe("positionsEqual", () => {
  test("compares slide and beat", () => {
    expect(positionsEqual({ slideIndex: 1, beatIndex: 0 }, { slideIndex: 1, beatIndex: 0 })).toBe(
      true,
    );
    expect(positionsEqual({ slideIndex: 1, beatIndex: 0 }, { slideIndex: 1, beatIndex: 1 })).toBe(
      false,
    );
    expect(positionsEqual({ slideIndex: 0, beatIndex: 0 }, { slideIndex: 1, beatIndex: 0 })).toBe(
      false,
    );
  });
});

describe("hashChangeTarget", () => {
  const slides = [
    { slug: "intro", stops: 1 },
    { slug: "arch", stops: 3 },
  ];

  test("returns the parsed position when the hash moved", () => {
    expect(hashChangeTarget({ slideIndex: 0, beatIndex: 0 }, "#arch/2", slides)).toEqual({
      slideIndex: 1,
      beatIndex: 2,
    });
  });

  test("returns undefined when the hash already matches", () => {
    expect(hashChangeTarget({ slideIndex: 1, beatIndex: 0 }, "#arch", slides)).toBeUndefined();
  });

  test("clamps a beat past the slide's last", () => {
    expect(hashChangeTarget({ slideIndex: 0, beatIndex: 0 }, "#arch/99", slides)).toEqual({
      slideIndex: 1,
      beatIndex: 2,
    });
  });
});

describe("positionFromHash", () => {
  test("clamps the beat to the slide it names", () => {
    const slides = [
      { slug: "intro", stops: 1 },
      { slug: "arch", stops: 3 },
    ];
    expect(positionFromHash("#arch/99", slides)).toEqual({ slideIndex: 1, beatIndex: 2 });
    expect(positionFromHash("#intro/4", slides)).toEqual({ slideIndex: 0, beatIndex: 0 });
    expect(positionFromHash("#nope", slides)).toEqual({ slideIndex: 0, beatIndex: 0 });
  });
});

describe("historyMode", () => {
  test("adds a history entry per slide and replaces it for each beat within one", () => {
    expect(historyMode({ slideIndex: 1, beatIndex: 0 }, { slideIndex: 1, beatIndex: 2 })).toBe(
      "replace",
    );
    expect(historyMode({ slideIndex: 1, beatIndex: 2 }, { slideIndex: 2, beatIndex: 0 })).toBe(
      "push",
    );
  });
});

describe("advance", () => {
  const counts = stops(2, 1, 0);

  test("advances a beat on the same slide while beats remain", () => {
    expect(advance({ slideIndex: 0, beatIndex: 0 }, counts)).toEqual({
      slideIndex: 0,
      beatIndex: 1,
    });
  });

  test("moves to the next slide after the last beat", () => {
    expect(advance({ slideIndex: 0, beatIndex: 1 }, counts)).toEqual({
      slideIndex: 1,
      beatIndex: 0,
    });
  });

  test("skips a title slide with no beats on the next advance", () => {
    expect(advance({ slideIndex: 1, beatIndex: 0 }, counts)).toEqual({
      slideIndex: 2,
      beatIndex: 0,
    });
  });

  test("stops on the last slide", () => {
    expect(advance({ slideIndex: 2, beatIndex: 0 }, counts)).toBeNull();
  });
});

describe("retreat", () => {
  const counts = stops(2, 1, 0);

  test("retreats a beat on the same slide while beats remain", () => {
    expect(retreat({ slideIndex: 0, beatIndex: 1 }, counts)).toEqual({
      slideIndex: 0,
      beatIndex: 0,
    });
  });

  test("moves to the previous slide's last beat from the first beat", () => {
    expect(retreat({ slideIndex: 1, beatIndex: 0 }, counts)).toEqual({
      slideIndex: 0,
      beatIndex: 1,
    });
  });

  test("lands on beat 0 when the previous slide has no beats", () => {
    expect(retreat({ slideIndex: 2, beatIndex: 0 }, counts)).toEqual({
      slideIndex: 1,
      beatIndex: 0,
    });
  });

  test("stops on the first slide", () => {
    expect(retreat({ slideIndex: 0, beatIndex: 0 }, counts)).toBeNull();
  });
});

describe("moveTarget", () => {
  const beats = stops(0, 3, 0);

  test("steps one beat either way", () => {
    expect(moveTarget("advance", { slideIndex: 1, beatIndex: 0 }, beats)).toEqual({
      slideIndex: 1,
      beatIndex: 1,
    });
    expect(moveTarget("retreat", { slideIndex: 1, beatIndex: 0 }, beats)).toEqual({
      slideIndex: 0,
      beatIndex: 0,
    });
  });

  test("jumps to the first beat of the talk and to the last beat of the last slide", () => {
    expect(moveTarget("first", { slideIndex: 1, beatIndex: 2 }, beats)).toEqual({
      slideIndex: 0,
      beatIndex: 0,
    });
    expect(moveTarget("last", { slideIndex: 0, beatIndex: 0 }, stops(0, 3, 2))).toEqual({
      slideIndex: 2,
      beatIndex: 1,
    });
  });
});

describe("deckStops", () => {
  test("gives each slide its arrival and one stop per beat", () => {
    expect(
      deckStops([
        { slug: "intro", beats: [] },
        { slug: "arch", beats: [{}, {}] },
      ]),
    ).toEqual([
      { slug: "intro", stops: 1 },
      { slug: "arch", stops: 3 },
    ]);
  });
});

describe("comparePositions", () => {
  test("orders by slide, then by beat", () => {
    const at = (slideIndex: number, beatIndex: number) => ({ slideIndex, beatIndex });
    expect(comparePositions(at(0, 3), at(1, 0))).toBeLessThan(0);
    expect(comparePositions(at(1, 2), at(1, 1))).toBeGreaterThan(0);
    expect(comparePositions(at(1, 1), at(1, 1))).toBe(0);
  });
});
