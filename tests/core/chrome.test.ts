import { describe, expect, test } from "bun:test";
import { playerChromeCss, printPageCss } from "../../src/core/chrome.ts";

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

  test("prints every slide on its own page with every beat shown and no chrome", () => {
    const css = playerChromeCss({ width: 1024, height: 768 });
    const print = css.slice(css.indexOf("@media print"));
    expect(css).toContain("@media print {");
    expect(print).toContain("@page { size: 1024px 768px; margin: 0 }");
    expect(print).toContain("#deck [data-step] { opacity: 1 !important;");
    expect(print).toMatch(/#dek-rail,[^{]*#dek-hint[^{]*\{ display: none !important; \}/);
    expect(css).toContain(
      "@media print { #dek-presenter, #dek-progress { display: none !important; } }",
    );
    // A player without the presenter must not name it at all; --remote serves that page.
    expect(playerChromeCss({ presenter: false })).not.toContain("dek-presenter");
  });

  test("never sets a slide's display, which is the theme's layout", () => {
    // A slide's display is its layout (grid, flex); chrome that sets it breaks the layout.
    const rules = (css: string) =>
      [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)].filter(
        ([, selector, body]) =>
          /(^|[\s>,])(#deck > )?\.slide(?![\w-])[^\s,]*\s*$/.test(
            selector?.split(",").pop() ?? "",
          ) && /(^|;)\s*display:/.test(body ?? ""),
      );
    const displays = [playerChromeCss(), printPageCss({ width: 1280, height: 720 })]
      .flatMap((css) => rules(css))
      .map(([, selector, body]) => `${selector?.trim()} {${body}}`);
    expect(displays).toEqual(["#deck > .slide:not(.is-current) { display: none; }"]);
  });

  test("hides inactive slides on screen only, so print shows them in the theme's layout", () => {
    expect(playerChromeCss()).toContain(
      "@media not print { #deck > .slide:not(.is-current) { display: none; } }",
    );
  });

  test("leaves the key hint off touch screens, which have no s or p to press", () => {
    const css = playerChromeCss();
    const coarse = css.indexOf("@media (pointer: coarse) { #dek-hint { display: none; } }");
    // After the hint's own rule, or that rule's display wins.
    expect(coarse).toBeGreaterThan(css.indexOf("#dek-hint {"));
  });

  test("keeps horizontal swipes on the slide for the deck, not the browser", () => {
    expect(playerChromeCss()).toMatch(/#dek-current-stage \{[^}]*touch-action: pan-y pinch-zoom;/);
  });

  test("keeps the presenter's panel labels above 4.5:1 on its dark ground", () => {
    expect(playerChromeCss()).toMatch(
      /body\.is-presenter \.dek-panel-label \{[^}]*opacity: 0\.65;/,
    );
  });

  test("hides the screen reader announcement from sight only", () => {
    expect(playerChromeCss()).toContain(
      "#dek-announce { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }",
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
