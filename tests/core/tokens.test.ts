import { describe, expect, test } from "bun:test";
import { isRawThemeValue } from "../../src/core/lint/tokens.ts";

describe("isRawThemeValue", () => {
  test("a color or a length written in a string is text, not a raw value", () => {
    expect(isRawThemeValue("content", '"#fff"')).toBe(false);
    expect(isRawThemeValue("content", '"red"')).toBe(false);
    expect(isRawThemeValue("content", "'10px'")).toBe(false);
    expect(isRawThemeValue("content", '"var(--a, b)"')).toBe(false);
  });

  test("still flags the raw values outside strings", () => {
    expect(isRawThemeValue("color", "#fff")).toBe(true);
    expect(isRawThemeValue("color", "red")).toBe(true);
    expect(isRawThemeValue("padding", "10px")).toBe(true);
    expect(isRawThemeValue("color", "var(--a, red)")).toBe(true);
    expect(isRawThemeValue("font-family", '"Noto Sans"')).toBe(true);
  });

  test("only var() and url() themselves are skipped, not a function whose name ends in var", () => {
    expect(isRawThemeValue("color", "var(--fg)")).toBe(false);
    expect(isRawThemeValue("background", "url(assets/red.png)")).toBe(false);
    expect(isRawThemeValue("width", "somevar(10px)")).toBe(true);
    expect(isRawThemeValue("width", "myurl(10px)")).toBe(true);
  });
});
