import { describe, expect, test } from "bun:test";
import {
  clampRailWidth,
  isRailToggleKey,
  RAIL_WIDTH_DEFAULT,
  readStoredRailVisible,
  readStoredRailWidth,
} from "../../src/runtime/rail.ts";

describe("isRailToggleKey", () => {
  test("maps s and S without modifiers", () => {
    expect(isRailToggleKey({ key: "s", altKey: false, ctrlKey: false, metaKey: false })).toBe(true);
    expect(isRailToggleKey({ key: "S", altKey: false, ctrlKey: false, metaKey: false })).toBe(true);
  });

  test("ignores modifiers, other keys, and key repeat", () => {
    expect(isRailToggleKey({ key: "s", altKey: false, ctrlKey: true, metaKey: false })).toBe(false);
    expect(isRailToggleKey({ key: "s", altKey: false, ctrlKey: false, metaKey: true })).toBe(false);
    expect(isRailToggleKey({ key: "p", altKey: false, ctrlKey: false, metaKey: false })).toBe(
      false,
    );
    expect(
      isRailToggleKey({ key: "s", altKey: false, ctrlKey: false, metaKey: false, repeat: true }),
    ).toBe(false);
  });
});

describe("clampRailWidth", () => {
  test("clamps to the allowed range", () => {
    expect(clampRailWidth(80)).toBe(120);
    expect(clampRailWidth(200)).toBe(200);
    expect(clampRailWidth(480)).toBe(360);
    expect(clampRailWidth(Number.NaN)).toBe(RAIL_WIDTH_DEFAULT);
  });
});

describe("stored rail chrome", () => {
  test("reads a stored width and defaults when missing", () => {
    expect(readStoredRailWidth({ getItem: () => "240" })).toBe(240);
    expect(readStoredRailWidth({ getItem: () => null })).toBe(RAIL_WIDTH_DEFAULT);
    expect(readStoredRailWidth(undefined)).toBe(RAIL_WIDTH_DEFAULT);
  });

  test("treats a stored 0 as hidden", () => {
    expect(readStoredRailVisible({ getItem: () => "0" })).toBe(false);
    expect(readStoredRailVisible({ getItem: () => "1" })).toBe(true);
    expect(readStoredRailVisible({ getItem: () => null })).toBe(true);
  });
});
