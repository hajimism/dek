import { describe, expect, test } from "bun:test";
import { decodePosition, encodePosition, isLiveEvent } from "../../src/core/live-protocol.ts";

describe("isLiveEvent", () => {
  test("takes every event the server sends", () => {
    for (const event of [
      { type: "sync", created: ["a"], updated: ["b"], removed: ["c"] },
      { type: "sync", created: [] },
      { type: "reload-slide", slug: "intro" },
      { type: "reload-theme" },
      { type: "reload-script", slugs: ["intro"] },
      { type: "diagnostics", diagnostics: [] },
      { type: "timeline" },
    ]) {
      expect(isLiveEvent(event)).toBe(true);
    }
  });

  test("turns away what it does not understand", () => {
    for (const value of [
      null,
      "reload",
      [],
      {},
      { type: "unknown" },
      { type: "toString" },
      { type: "reload-slide" },
      { type: "reload-script", slugs: [1] },
      { type: "sync", created: ["a"], removed: "b" },
      { type: "diagnostics" },
    ]) {
      expect(isLiveEvent(value)).toBe(false);
    }
  });
});

describe("encodePosition / decodePosition", () => {
  test("round-trips a position, as text or as the object a BroadcastChannel carries", () => {
    const pos = { slideIndex: 1, beatIndex: 2 };
    expect(decodePosition(encodePosition(pos))).toEqual(pos);
    expect(decodePosition(pos)).toEqual(pos);
  });

  test("keeps only the position of what it reads", () => {
    expect(decodePosition(JSON.stringify({ slideIndex: 1, beatIndex: 0, extra: "x" }))).toEqual({
      slideIndex: 1,
      beatIndex: 0,
    });
  });

  test("turns away anything that is not a position", () => {
    for (const raw of [
      "not-json",
      null,
      42,
      JSON.stringify({ slideIndex: 1 }),
      JSON.stringify({ beatIndex: 0 }),
      JSON.stringify({ slideIndex: "0", beatIndex: 0 }),
      JSON.stringify({ slideIndex: -1, beatIndex: 0 }),
      JSON.stringify({ slideIndex: 1.5, beatIndex: 0 }),
      JSON.stringify({ slideIndex: 0, beatIndex: 1.2 }),
      { slideIndex: Number.NaN, beatIndex: 0 },
      { slideIndex: Number.POSITIVE_INFINITY, beatIndex: 0 },
    ]) {
      expect(decodePosition(raw)).toBeUndefined();
    }
  });
});
