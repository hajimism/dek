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

describe("isRawThemeValue reads a value as CSS tokens", () => {
  test("a negative length is as raw as a positive one", () => {
    expect(isRawThemeValue("margin-top", "-12px")).toBe(true);
    expect(isRawThemeValue("translate", "-1.5rem 0")).toBe(true);
    expect(isRawThemeValue("margin", "calc(-1 * var(--gap))")).toBe(false);
  });

  test("the family in a font shorthand is raw, as it is in font-family", () => {
    expect(isRawThemeValue("font", "700 var(--size-body) sans-serif")).toBe(true);
    expect(isRawThemeValue("font", 'italic var(--size-body) "Noto Sans"')).toBe(true);
    expect(isRawThemeValue("font", "italic bold var(--size-title)/1.2 var(--font-title)")).toBe(
      false,
    );
  });

  test("a system color is a raw color", () => {
    expect(isRawThemeValue("color", "CanvasText")).toBe(true);
    expect(isRawThemeValue("background", "Canvas")).toBe(true);
  });

  test("viewport, container, and root-relative units are raw; font-relative ones are not", () => {
    for (const value of ["10dvh", "5svw", "3cqw", "2cqmin", "1vi", "2rlh"]) {
      expect({ value, raw: isRawThemeValue("height", value) }).toEqual({ value, raw: true });
    }
    for (const value of ["2ch", "1.5lh", "1em", "50%", "1fr", "0"]) {
      expect({ value, raw: isRawThemeValue("width", value) }).toEqual({ value, raw: false });
    }
  });

  test("an easing written out is raw motion; a keyword is not", () => {
    expect(
      isRawThemeValue("transition", "opacity var(--step-transition) cubic-bezier(.2, .8, .2, 1)"),
    ).toBe(true);
    expect(isRawThemeValue("animation-timing-function", "steps(4)")).toBe(true);
    expect(isRawThemeValue("animation-timing-function", "linear(0, 0.3, 1)")).toBe(true);
    expect(isRawThemeValue("transition", "opacity var(--step-transition) ease-out")).toBe(false);
    expect(isRawThemeValue("animation", "spin var(--step-transition) linear infinite")).toBe(false);
  });

  // A color name only means a color where a color goes: `tan` names a grid area, `coral` a
  // view transition.
  test("a color name is raw only in a property that takes a color", () => {
    expect(isRawThemeValue("grid-area", "tan")).toBe(false);
    expect(isRawThemeValue("view-transition-name", "coral")).toBe(false);
    expect(isRawThemeValue("animation-name", "tomato")).toBe(false);
    expect(isRawThemeValue("border", "var(--hair) solid red")).toBe(true);
    expect(isRawThemeValue("box-shadow", "0 0 0 var(--hair) red")).toBe(true);
    expect(isRawThemeValue("-webkit-text-stroke", "var(--hair) white")).toBe(true);
  });
});
