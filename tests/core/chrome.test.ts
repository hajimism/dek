import { describe, expect, test } from "bun:test";
import { playerChromeCss } from "../../src/core/chrome.ts";

describe("playerChromeCss", () => {
  test("uses the given width and height", () => {
    const css = playerChromeCss({ width: 1024, height: 768, presenter: false });
    expect(css).toContain("width: 1024px");
    expect(css).toContain("height: 768px");
  });

  test("sets transform-origin so scale fits from the top", () => {
    expect(playerChromeCss()).toContain("transform-origin");
  });
});
