import { describe, expect, test } from "bun:test";
import { playerChromeCss } from "../../src/core/chrome.ts";

describe("playerChromeCss", () => {
  test("uses the given width and height", () => {
    const css = playerChromeCss({ width: 1024, height: 768, presenter: false });
    expect(css).toContain("width: 1024px");
    expect(css).toContain("height: 768px");
  });

  test("names the slide box so a page change animates only the slide", () => {
    const css = playerChromeCss();
    expect(css).toMatch(/#deck \{[^}]*view-transition-name: slide;/);
    expect(css).toContain("::view-transition-group(slide) { overflow: clip; }");
    expect(css).toContain(
      "::view-transition-old(root), ::view-transition-new(root) { animation: none; }",
    );
  });

  test("fades the key hint in and out without catching the pointer", () => {
    const css = playerChromeCss();
    expect(css).toMatch(/#dek-hint \{[^}]*pointer-events: none;[^}]*animation: dek-hint /);
    expect(css).toContain("@keyframes dek-hint");
    expect(css).toMatch(/prefers-reduced-motion: reduce[^@]*#dek-hint/);
    expect(css).toContain(
      "body:not(.is-rail-hidden):has(> #dek-shell > #dek-rail) #dek-hint { left: calc(50% + var(--dek-rail-w, 188px) / 2); }",
    );
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
