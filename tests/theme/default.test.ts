import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cssCustomProperties } from "../../src/core/css.ts";
import { lintDeck } from "../../src/core/index.ts";
import { REQUIRED_TOKENS } from "../../src/core/tokens.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const themePath = join(import.meta.dir, "..", "..", "src", "theme", "default.css");

function stripCommentsAndAtRules(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@media[^{]*\{[\s\S]*?\n\}/g, "")
    .replace(/@keyframes[^{]*\{[\s\S]*?\n\}/g, "")
    .replace(/::view-transition-[^{]*\{[\s\S]*?\}/g, "");
}

function topLevelSelectors(css: string): string[] {
  const selectors: string[] = [];
  const cleaned = stripCommentsAndAtRules(css);
  for (const block of cleaned.split("}")) {
    const selector = block.split("{")[0]?.trim();
    if (selector) {
      selectors.push(selector);
    }
  }
  return selectors;
}

describe("default theme", () => {
  const css = readFileSync(themePath, "utf8");

  test("fills the player frame instead of hard-coding the pixel size", () => {
    const slideRule = css.match(/\.slide\s*\{[^}]*\}/)?.[0] ?? "";
    expect(slideRule).toContain("width: 100%");
    expect(slideRule).toContain("height: 100%");
  });

  test("defines the five layouts", () => {
    for (const layout of ["title", "default", "two-col", "full-bleed", "quote"]) {
      expect(css).toContain(`data-layout="${layout}"`);
    }
  });

  test("default layout is top-aligned so titles stay put across beats", () => {
    const rule = css.match(/\.slide\[data-layout="default"\]\s*\{[^}]*\}/)?.[0] ?? "";
    expect(rule).toContain("flex-direction: column");
    expect(rule).not.toContain("justify-content: center");
  });

  test("hides data-step with opacity and transform, not display none", () => {
    expect(css).toContain("[data-step]");
    expect(css).toContain(".is-shown");
    expect(css).toContain("opacity");
    expect(css).toContain("transform");
    const stepRule = css.match(/\[data-step\][^{]*\{[^}]*\}/)?.[0] ?? "";
    expect(stepRule).not.toContain("display: none");
  });

  test("hides data-step only on the current player slide", () => {
    const hide = css.match(/\.slide\.is-current\s+\[data-step\][^{]*\{[^}]*\}/)?.[0] ?? "";
    expect(hide).toContain("opacity: 0");
    expect(hide).not.toContain("display: none");

    const shown =
      css.match(/\.slide\.is-current\s+\[data-step\]\.is-shown[^{]*\{[^}]*\}/)?.[0] ?? "";
    expect(shown).toContain("opacity: 1");

    const standaloneHide = css.match(/\.slide\s+\[data-step\][^{]*\{[^}]*\}/)?.[0] ?? "";
    expect(standaloneHide).toBe("");
  });

  test("defines the README example classes", () => {
    for (const name of ["col", "node", "node-parent", "figure", "figure-small"]) {
      expect(css).toContain(`.${name}`);
    }
    expect(css).toContain('data-layout="two-col"');
  });

  test("includes view transitions and prefers-reduced-motion", () => {
    expect(css).toContain("::view-transition-old");
    expect(css).toContain("::view-transition-new");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("@keyframes fade-out");
    expect(css).toContain("@keyframes fade-in");
  });

  test("stops view-transition animation when motion is reduced", () => {
    const reduced =
      css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(reduced).toContain("::view-transition-old");
    expect(reduced).toContain("::view-transition-new");
    expect(reduced).toContain("animation: none");
  });

  test("scopes selectors under .slide except view-transition and at-rules", () => {
    for (const selector of topLevelSelectors(css)) {
      for (const part of selector.split(",")) {
        expect(part.trim()).toMatch(/^\.slide(?=$|[\s[.:#>])/);
      }
    }
  });

  test("publishes the required tokens on .slide", () => {
    const published = cssCustomProperties(css);
    for (const name of REQUIRED_TOKENS) {
      expect(published.has(name)).toBe(true);
    }
  });

  test("passes DEK014 and DEK015", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: css,
            slides: {
              intro: slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`),
            },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.filter((d) => d.id === "DEK014" || d.id === "DEK015")).toEqual([]);
      },
    );
  });
});
