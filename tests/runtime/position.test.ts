import { describe, expect, test } from "bun:test";
import {
  clampPosition,
  formatHash,
  hashChangeTarget,
  historyMode,
  parseHash,
  parsePosition,
  positionFromHash,
  positionsEqual,
} from "../../src/runtime/position.ts";

const slugs = ["intro", "arch"];

describe("formatHash", () => {
  test("uses the slug and a 1-based beat when beatIndex is above 0", () => {
    expect(formatHash({ slideIndex: 1, beatIndex: 2 }, slugs)).toBe("#arch/3");
  });

  test("omits the beat when beatIndex is 0", () => {
    expect(formatHash({ slideIndex: 1, beatIndex: 0 }, slugs)).toBe("#arch");
  });
});

describe("parseHash", () => {
  test("round-trips formatHash", () => {
    const pos = { slideIndex: 1, beatIndex: 2 };
    expect(parseHash(formatHash(pos, slugs), slugs)).toEqual(pos);
  });

  test("returns the first slide for an unknown slug or empty hash", () => {
    expect(parseHash("#missing", slugs)).toEqual({ slideIndex: 0, beatIndex: 0 });
    expect(parseHash("", slugs)).toEqual({ slideIndex: 0, beatIndex: 0 });
    expect(parseHash("#", slugs)).toEqual({ slideIndex: 0, beatIndex: 0 });
  });
});

describe("parsePosition", () => {
  test("reads slideIndex and beatIndex from JSON", () => {
    expect(parsePosition(JSON.stringify({ slideIndex: 1, beatIndex: 2 }))).toEqual({
      slideIndex: 1,
      beatIndex: 2,
    });
  });

  test("returns undefined for invalid JSON or missing fields", () => {
    expect(parsePosition("not-json")).toBeUndefined();
    expect(parsePosition(JSON.stringify({ slideIndex: 1 }))).toBeUndefined();
    expect(parsePosition(JSON.stringify({ beatIndex: 0 }))).toBeUndefined();
    expect(parsePosition(JSON.stringify({ slideIndex: "0", beatIndex: 0 }))).toBeUndefined();
    expect(parsePosition(JSON.stringify({ slideIndex: Number.NaN, beatIndex: 0 }))).toBeUndefined();
    expect(
      parsePosition(JSON.stringify({ slideIndex: Number.POSITIVE_INFINITY, beatIndex: 0 })),
    ).toBeUndefined();
    expect(parsePosition(JSON.stringify({ slideIndex: -1, beatIndex: 0 }))).toBeUndefined();
    expect(parsePosition(JSON.stringify({ slideIndex: 1.5, beatIndex: 0 }))).toBeUndefined();
    expect(parsePosition(JSON.stringify({ slideIndex: 0, beatIndex: 1.2 }))).toBeUndefined();
  });
});

describe("clampPosition", () => {
  test("drops a slide that is out of range", () => {
    expect(clampPosition({ slideIndex: 9, beatIndex: 0 }, [{ beats: 1 }])).toBeUndefined();
  });

  test("clamps beatIndex to the last beat", () => {
    expect(clampPosition({ slideIndex: 0, beatIndex: 5 }, [{ beats: 2 }])).toEqual({
      slideIndex: 0,
      beatIndex: 1,
    });
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
    { slug: "intro", beats: 0 },
    { slug: "arch", beats: 2 },
  ];

  test("returns the parsed position when the hash moved", () => {
    expect(hashChangeTarget({ slideIndex: 0, beatIndex: 0 }, "#arch/2", slides)).toEqual({
      slideIndex: 1,
      beatIndex: 1,
    });
  });

  test("returns undefined when the hash already matches", () => {
    expect(hashChangeTarget({ slideIndex: 1, beatIndex: 0 }, "#arch", slides)).toBeUndefined();
  });

  test("clamps a beat past the slide's last", () => {
    expect(hashChangeTarget({ slideIndex: 0, beatIndex: 0 }, "#arch/99", slides)).toEqual({
      slideIndex: 1,
      beatIndex: 1,
    });
  });
});

describe("positionFromHash", () => {
  test("clamps the beat to the slide it names", () => {
    const slides = [
      { slug: "intro", beats: 0 },
      { slug: "arch", beats: 3 },
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
