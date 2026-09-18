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

  test("hides inactive slides without forcing display on the current one", () => {
    const css = playerChromeCss({ presenter: false });
    expect(css).toContain("#deck > .slide:not(.is-current) { display: none; }");
    expect(css).not.toContain("#deck > .slide.is-current { display: block; }");
  });
});
