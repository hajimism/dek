import { describe, expect, test } from "bun:test";
import { deckScale } from "../../src/runtime/fit.ts";

describe("deckScale", () => {
  const logical = { width: 1280, height: 720 };

  test("is 1 when the viewport is larger than the slide", () => {
    expect(deckScale({ viewport: { width: 1920, height: 1080 }, logical })).toBe(1);
  });

  test("uses the tighter of width and height ratios", () => {
    expect(deckScale({ viewport: { width: 640, height: 720 }, logical })).toBe(0.5);
    expect(deckScale({ viewport: { width: 1280, height: 360 }, logical })).toBe(0.5);
  });

  test("shrinks further when reservedRight is set", () => {
    const without = deckScale({ viewport: { width: 1280, height: 720 }, logical });
    const withSidebar = deckScale({
      viewport: { width: 1280, height: 720 },
      logical,
      reservedRight: 448,
    });
    expect(without).toBe(1);
    expect(withSidebar).toBeLessThan(without);
    expect(withSidebar).toBe((1280 - 448) / 1280);
  });

  test("does not divide by zero", () => {
    expect(deckScale({ viewport: { width: 0, height: 720 }, logical })).toBe(0);
    expect(deckScale({ viewport: { width: 1280, height: 0 }, logical })).toBe(0);
    expect(
      deckScale({ viewport: { width: 1280, height: 720 }, logical: { width: 0, height: 720 } }),
    ).toBe(0);
    expect(
      deckScale({ viewport: { width: 1280, height: 720 }, logical: { width: 1280, height: 0 } }),
    ).toBe(0);
  });
});
