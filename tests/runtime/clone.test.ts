import { describe, expect, test } from "bun:test";
import { deckSize } from "../../src/runtime/clone.ts";

describe("deckSize", () => {
  test("is the deck's laid-out size", () => {
    expect(deckSize({ offsetWidth: 1920, offsetHeight: 1080 })).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  test("falls back to 1280 by 720 when the deck is not laid out", () => {
    expect(deckSize({ offsetWidth: 0, offsetHeight: 0 })).toEqual({ width: 1280, height: 720 });
  });
});
