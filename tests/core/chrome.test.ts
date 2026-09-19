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

  test("lays out a left thumbnail rail in the player chrome", () => {
    const css = playerChromeCss({ presenter: false, width: 1024, height: 768 });
    expect(css).toContain("#dek-rail");
    expect(css).toContain("aspect-ratio: 1024/768");
    expect(css).toContain(
      "body:not(.is-presenter):not(.is-rail-hidden) #dek-shell:has(> #dek-rail)",
    );
    expect(css).toContain("#dek-rail-resize");
    expect(css).toContain("body.is-rail-hidden #dek-rail");
  });

  test("scopes presenter layout to the is-presenter class", () => {
    const css = playerChromeCss();
    expect(css).toContain("body.is-presenter");
    expect(css).toContain(
      "body.is-presenter #dek-rail, body.is-presenter #dek-rail-resize { display: none; }",
    );
    expect(css).toContain("#dek-shell");
    expect(css).toContain("dek-preview-frame");
    const player = playerChromeCss({ presenter: false });
    expect(player).not.toContain("body.is-presenter #dek-rail");
    expect(player).not.toContain("body.is-presenter #dek-shell");
  });
});
