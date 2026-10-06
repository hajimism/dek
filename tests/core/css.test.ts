import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  cssAtRules,
  cssClassNames,
  cssLayoutNames,
  cssUrls,
  isScopedThemeSelector,
  outermostSelectors,
  parseCss,
  publishedTokens,
  type Stylesheet,
} from "../../src/core/css.ts";
import {
  minifyCss,
  replaceUrls,
  rewriteCss,
  scopeToSlide,
  shareTokensWithTransitions,
} from "../../src/core/css-transform.ts";
import { lintDeck } from "../../src/core/lint.ts";
import { themeExcerpt } from "../../src/core/theme-excerpt.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const tokenNames = (sheet: Stylesheet) => publishedTokens(sheet).map((token) => token.name);
const scopeSlideCss = (css: string, slug: string) => rewriteCss(parseCss(css), scopeToSlide(slug));
const shareTokens = (css: string) => rewriteCss(parseCss(css), shareTokensWithTransitions);

const titleSlide = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

describe("minifyCss", () => {
  test("drops comments and collapses whitespace outside strings", () => {
    expect(minifyCss("/* theme */\n.slide {\n  color:  var(--fg);\n}\n")).toBe(
      ".slide { color: var(--fg); }",
    );
  });

  test("keeps strings byte for byte, U+3000 and comment markers included", () => {
    const css =
      ".a::before { content: \"x\u3000\u3000y  /* z */\"; } .b::after { content: 'it\\'s  '; }";
    expect(minifyCss(css)).toBe(css);
  });

  test("treats U+3000 and NBSP outside strings as content, not whitespace", () => {
    expect(minifyCss(".a { --gap: \u3000; --nb:\u00a0; }")).toBe(
      ".a { --gap: \u3000; --nb:\u00a0; }",
    );
  });
});

describe("cssClassNames", () => {
  test("collects classes from selectors including compound names", () => {
    const names = cssClassNames(
      parseCss(`
.slide { width: 1280px; }
.slide-title, .is-shown { opacity: 1; }
.slide.foo { color: red; }
`),
    );
    expect(names).toEqual(new Set(["slide", "slide-title", "is-shown", "foo"]));
  });

  test("ignores dots inside url() and numeric literals", () => {
    const names = cssClassNames(
      parseCss(`
.slide {
  background: url("fonts/Inter.woff2");
  background-image: url(foo.bar.png);
  opacity: 0.4;
}
`),
    );
    expect(names).toEqual(new Set(["slide"]));
    expect(names.has("woff2")).toBe(false);
    expect(names.has("bar")).toBe(false);
  });

  test("collects classes inside @media", () => {
    const names = cssClassNames(
      parseCss(`
@media (min-width: 800px) {
  .slide .extra { display: block; }
}
`),
    );
    expect(names).toEqual(new Set(["slide", "extra"]));
  });
});

describe("DEK013", () => {
  test("does not count font filenames toward the class limit", async () => {
    const classes = Array.from({ length: 39 }, (_, i) => `.slide .c${i} {}`).join("\n");
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: `.slide { background: url("fonts/Inter.woff2"); }\n${classes}\n`,
            slides: { intro: titleSlide },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.some((d) => d.id === "DEK013")).toBe(false);
      },
    );
  });
});

describe("publishedTokens", () => {
  test("collects custom properties from the .slide rule", () => {
    const names = tokenNames(
      parseCss(`
.slide {
  --fg: #fff;
  --bg: #111;
  color: var(--fg);
}
.slide .node { --fg: #000; }
`),
    );
    expect(names).toEqual(["--fg", "--bg"]);
  });

  test("ignores custom properties on descendant and layout selectors", () => {
    const names = tokenNames(
      parseCss(`
.slide .node { --fg: #000; }
.slide[data-layout="title"] { --pad: 0; }
`),
    );
    expect(names).toEqual([]);
  });

  test("ignores custom properties inside comments", () => {
    const names = tokenNames(
      parseCss(`
.slide {
  /* --fg: #fff; */
  --bg: #111;
}
`),
    );
    expect(names).toEqual(["--bg"]);
  });
});

describe("declarations", () => {
  test("walks declarations including nested at-rules and reports lines", () => {
    const decls = parseCss(`
.slide { --fg: #fff; color: var(--fg); }
@media (prefers-reduced-motion: reduce) {
  .slide { transition: none; }
}
@keyframes fade-in {
  from { opacity: 0; }
}
`).decls;
    expect(decls).toMatchObject([
      { selector: ".slide", property: "--fg", value: "#fff", line: 2 },
      { selector: ".slide", property: "color", value: "var(--fg)", line: 2 },
      { selector: ".slide", property: "transition", value: "none", line: 4 },
      { selector: "from", property: "opacity", value: "0", line: 7 },
    ]);
  });

  test("keeps the declarations around and inside a nested at-rule with a colon in its prelude", () => {
    const decls = parseCss(
      ".card { padding: var(--gap); @media (min-width: 600px) { padding: var(--pad); } color: #fff; @layer x; margin: 0; }",
    ).decls;
    expect(decls.map((d) => [d.selector, d.property, d.value, d.atPath])).toEqual([
      [".card", "padding", "var(--gap)", []],
      [".card", "padding", "var(--pad)", ["@media (min-width: 600px)"]],
      [".card", "color", "#fff", []],
      [".card", "margin", "0", []],
    ]);
  });
});

const braceInString = `.slide .a::before { content: "}"; color: var(--fg); }
.slide .b { content: '{'; color: var(--fg); }
.slide .c { background: url("x}y.png"); }
body { color: red; }`;

describe("string-aware scanning", () => {
  test("cssClassNames sees every class when a value contains a brace", () => {
    expect([...cssClassNames(parseCss(braceInString))].sort()).toEqual(["a", "b", "c", "slide"]);
  });

  test("outermostSelectors reports only the real outermost rules", () => {
    expect(outermostSelectors(parseCss(braceInString)).map((rule) => rule.selector)).toEqual([
      ".slide .a::before",
      ".slide .b",
      ".slide .c",
      "body",
    ]);
  });

  test("cssDeclarations keeps selector, property, value, and line intact", () => {
    const decls = parseCss(braceInString).decls;
    expect(decls.map((d) => `${d.selector}|${d.property}|${d.line}`)).toEqual([
      ".slide .a::before|content|1",
      ".slide .a::before|color|1",
      ".slide .b|content|2",
      ".slide .b|color|2",
      ".slide .c|background|3",
      "body|color|4",
    ]);
    expect(decls[0]?.value).toBe('"}"');
  });

  test("escaped quotes inside a string do not end it", () => {
    const css = `.slide .q::after { content: "\\"}"; color: var(--fg); }\n.slide .r { color: var(--fg); }`;
    expect([...cssClassNames(parseCss(css))].sort()).toEqual(["q", "r", "slide"]);
    expect(outermostSelectors(parseCss(css)).map((rule) => rule.selector)).toEqual([
      ".slide .q::after",
      ".slide .r",
    ]);
  });

  test("a brace in a string inside @media does not leak a rule out of it", () => {
    const css = `@media (min-width: 1px) { .slide .m::before { content: "}"; } }\n.slide .n { color: var(--fg); }`;
    expect(outermostSelectors(parseCss(css)).map((rule) => rule.selector)).toEqual([
      ".slide .m::before",
      ".slide .n",
    ]);
    expect([...cssClassNames(parseCss(css))].sort()).toEqual(["m", "n", "slide"]);
  });

  test("publishedTokens reads tokens after a string-bearing rule", () => {
    const css = `.slide .x::before { content: "{"; }\n.slide { --fg: #fff; }`;
    expect(tokenNames(parseCss(css))).toEqual(["--fg"]);
  });
});

describe("scopeSlideCss", () => {
  const scope = '.slide:where([data-slug="usb"])';

  test("prefixes a bare selector with the slide", () => {
    expect(scopeSlideCss(".bar { opacity: 0; }", "usb")).toBe(`${scope} .bar { opacity: 0; }`);
  });

  test("attaches to a leading .slide compound instead of nesting under it", () => {
    expect(scopeSlideCss(".slide { --fg: #fff; }", "usb")).toBe(`${scope} { --fg: #fff; }`);
    expect(scopeSlideCss(".slide.is-current .bar { opacity: 1; }", "usb")).toBe(
      `${scope}.is-current .bar { opacity: 1; }`,
    );
  });

  test("does not mistake a class that starts with slide for .slide", () => {
    expect(scopeSlideCss(".slide-title { margin: 0; }", "usb")).toBe(
      `${scope} .slide-title { margin: 0; }`,
    );
  });

  test("scopes each selector in a list and inside at-rules", () => {
    expect(
      scopeSlideCss("@media (prefers-reduced-motion: reduce) { .a, .b { opacity: 1; } }", "usb"),
    ).toBe(`@media (prefers-reduced-motion: reduce) { ${scope} .a, ${scope} .b { opacity: 1; } }`);
  });

  test("adds only the specificity of .slide, so theme state rules still win", () => {
    // `.slide.is-current [data-step]` in the theme must keep beating a slide's `.bar`.
    expect(scopeSlideCss(".bar { opacity: 0.5; }", "usb")).toBe(
      '.slide:where([data-slug="usb"]) .bar { opacity: 0.5; }',
    );
  });

  test("keeps commas inside :is(), :where(), and :not() within their selector", () => {
    expect(scopeSlideCss(":is(.a, .b) > p, .c:not(.d, .e) { opacity: 1; }", "usb")).toBe(
      `${scope} :is(.a, .b) > p, ${scope} .c:not(.d, .e) { opacity: 1; }`,
    );
  });

  test("renames local keyframes and the animations that use them", () => {
    const out = scopeSlideCss(
      "@keyframes pop { from { opacity: 0; } to { opacity: 1; } }\n.bar { animation: pop var(--step-transition); }\n.baz { animation-name: pop, fade; }",
      "usb",
    );
    expect(out).toContain("@keyframes usb--pop { from { opacity: 0; } to { opacity: 1; } }");
    expect(out).toContain(`${scope} .bar { animation: usb--pop var(--step-transition); }`);
    expect(out).toContain(`${scope} .baz { animation-name: usb--pop, fade; }`);
  });
});

describe("shareTokensWithTransitions", () => {
  test("gives ::view-transition the tokens a bare .slide sets, and nothing else", () => {
    expect(shareTokens(".slide { --step-transition: 0.3s ease; padding: var(--pad); }")).toBe(
      ".slide { --step-transition: 0.3s ease; padding: var(--pad); }\n::view-transition { --step-transition: 0.3s ease; }",
    );
  });

  test("keeps the twin inside the at-rule, so a media query reaches the transition too", () => {
    expect(
      shareTokens("@media (prefers-reduced-motion: reduce) { .slide { --step-transition: 0s; } }"),
    ).toBe(
      "@media (prefers-reduced-motion: reduce) { .slide { --step-transition: 0s; }\n::view-transition { --step-transition: 0s; } }",
    );
  });

  test("shares a selector list that names .slide on its own", () => {
    expect(shareTokens(".slide, .print { --gap: 2rem; }")).toContain(
      "::view-transition { --gap: 2rem; }",
    );
  });

  test("leaves tokens that only some slides get where they are", () => {
    const css =
      '.slide.is-current { --a: 1; }\n.slide[data-layout="title"] { --b: 2; }\n.slide .card { --c: 3; }';
    expect(shareTokens(css)).toBe(css);
  });

  test("leaves a .slide rule without tokens, and a commented-out token, alone", () => {
    expect(shareTokens(".slide { color: var(--fg); }")).toBe(".slide { color: var(--fg); }");
    expect(shareTokens(".slide { /* --old: 1; */ --new: 2; }")).toBe(
      ".slide { /* --old: 1; */ --new: 2; }\n::view-transition { --new: 2; }",
    );
  });

  test("leaves a nested rule's tokens with it, and still shares the ones after it", () => {
    const css = ".slide { --a: 1; &.dark { --bg: #000; --fg: #fff } &:hover { --h: 1 } --z: 2; }";
    expect(shareTokens(css)).toBe(`${css}\n::view-transition { --a: 1; --z: 2; }`);
  });

  test("leaves out a token that holds a url(), which the transition never draws", () => {
    const css = ".slide { --bg-image: url(bg.png); --fg: #fff; }";
    expect(shareTokens(css)).toBe(`${css}\n::view-transition { --fg: #fff; }`);
  });

  test("steps over a nested at-rule whose prelude has a colon", () => {
    const css = ".slide { --a: 1; @media (min-width: 600px) { --a: 2; } --b: 3; }";
    expect(shareTokens(css)).toBe(`${css}\n::view-transition { --a: 1; --b: 3; }`);
  });

  test("copies a value that looks like a comment inside a string as written", () => {
    expect(shareTokens('.slide { --label: "a /* b */ c"; }')).toContain(
      '::view-transition { --label: "a /* b */ c"; }',
    );
  });
});

describe("themeExcerpt", () => {
  const theme = `
.slide {
  --fg: #111;
  --bg: #fff;
  --accent: var(--fg);
  --unused: 4px;
  color: var(--fg);
}
.slide::before { content: ""; }
.slide .card { border-color: var(--accent); }
.slide .tag { color: red; }
.slide ol { margin: 0; }
.slide[data-layout="title"] { place-items: center; }
.slide[data-layout="split"] { display: grid; }
.slide.is-current [data-step].is-shown { opacity: 1; }
.slide .card, .slide .tag { padding: 0; }
.slide .card:hover { animation: pop 1s; }
@keyframes pop { from { opacity: 0; } to { opacity: 1; } }
@keyframes spin { to { rotate: 1turn; } }
@media (prefers-color-scheme: dark) {
  .slide { --fg: #eee; --unused: 8px; }
  .slide .tag { color: blue; }
}
::view-transition-old(root) { animation: none; }
`;
  const excerpt = themeExcerpt(parseCss(theme), { classes: ["slide", "card"], layout: "title" });

  test("keeps the rules for the classes and layout the slide uses", () => {
    expect(excerpt).toContain(".slide .card {");
    expect(excerpt).toContain('.slide[data-layout="title"] {');
    expect(excerpt).not.toContain(".slide .tag {");
    expect(excerpt).not.toContain('data-layout="split"');
  });

  test("keeps element, pseudo-element, and runtime state rules", () => {
    expect(excerpt).toContain(".slide ol {");
    expect(excerpt).toContain(".slide::before {");
    expect(excerpt).toContain(".slide.is-current [data-step].is-shown {");
  });

  test("keeps only the matching parts of a selector list", () => {
    expect(excerpt).toContain(".slide .card {\n  padding: 0;");
    expect(excerpt).not.toContain(".slide .card, .slide .tag");
  });

  test("keeps only the tokens the kept rules reach through var()", () => {
    expect(excerpt).toContain("--accent: var(--fg);");
    expect(excerpt).toContain("--fg: #111;");
    expect(excerpt).not.toContain("--bg");
    expect(excerpt).not.toContain("--unused");
  });

  test("keeps referenced keyframes and the at-rules around kept rules", () => {
    expect(excerpt).toContain("@keyframes pop {");
    expect(excerpt).not.toContain("@keyframes spin");
    expect(excerpt).toContain(
      "@media (prefers-color-scheme: dark) {\n  .slide {\n    --fg: #eee;\n  }\n}",
    );
  });

  test("leaves out deck-level view transitions", () => {
    expect(excerpt).not.toContain("view-transition");
  });

  test("with the slide's markup, keeps only the element and attribute rules it can match", () => {
    const sheet = parseCss(`.slide { color: var(--fg); }
.slide h2 { margin: 0; }
.slide ul > li:first-child { margin: 0; }
.slide.is-current [data-step] { opacity: 0; }
.slide [aria-hidden="true"] { opacity: 0.5; }
.slide p:not(:empty, blockquote) { margin: 0; }
.slide :is(ol, table) { margin: 0; }
.slide[data-slug] { outline: 0; }
`);
    const excerpt = themeExcerpt(sheet, {
      classes: ["slide"],
      markup: { tags: ["section", "H2", "p"], attributes: ["class", "data-layout"] },
    });
    expect(excerpt).toContain(".slide h2 {");
    expect(excerpt).toContain(".slide p:not(:empty, blockquote) {");
    expect(excerpt).toContain(".slide :is(ol, table) {");
    expect(excerpt).toContain(".slide[data-slug] {");
    expect(excerpt).not.toContain("ul");
    expect(excerpt).not.toContain("[data-step]");
    expect(excerpt).not.toContain("aria-hidden");
  });

  test("follows tokens and keyframes the slide's own stylesheet uses", () => {
    const own = themeExcerpt(parseCss(theme), {
      classes: ["slide"],
      css: parseCss(".slide .mine { color: var(--bg); animation: spin 1s; }"),
    });
    expect(own).toContain("--bg: #fff;");
    expect(own).toContain("@keyframes spin {");
  });
});

describe("scanners share the string-aware rule walker", () => {
  test("cssAtRules lists block and statement at-rules, not an @ inside a string", () => {
    const css = `@import "x.css";
.a::before { content: "@ not a rule"; }
@media (min-width: 1px) { .b { color: red; } }
@font-face { font-family: "F"; }
`;
    expect(cssAtRules(parseCss(css)).map((at) => at.name)).toEqual([
      "import",
      "media",
      "font-face",
    ]);
  });

  test("cssUrls reads url() from declaration values, with lines, not from strings", () => {
    const css = `.a::before { content: "url(not-a-ref.png)"; }
.b {
  background: url("assets/bg.png");
  mask: url(assets/m.svg) no-repeat;
}
`;
    expect(cssUrls(parseCss(css))).toEqual([
      { value: "assets/bg.png", line: 3 },
      { value: "assets/m.svg", line: 4 },
    ]);
  });

  test("cssUrls reads the files an @font-face or another descriptor block loads", () => {
    const css = `@font-face {
  font-family: F;
  src: url(assets/f.woff2) format("woff2"), url("assets/f.woff");
}
@media print { @font-face { src: url(assets/p.woff2); } }
`;
    expect(cssUrls(parseCss(css))).toEqual([
      { value: "assets/f.woff2", line: 3 },
      { value: "assets/f.woff", line: 3 },
      { value: "assets/p.woff2", line: 5 },
    ]);
  });

  test("cssLayoutNames reads data-layout from selectors, not from values", () => {
    const css = `.slide[data-layout="title"] { --x: '[data-layout=fake]'; }
.slide[data-layout=split] .a { color: red; }
`;
    expect([...cssLayoutNames(parseCss(css))].sort()).toEqual(["split", "title"]);
  });
});

describe("nested rules", () => {
  const nested = `.slide {
  --fg: #111;
  .hero { background: url(assets/a.png); color: red; }
  &:hover { border-color: #f00; }
  @media (min-width: 600px) { padding: 10px; }
}`;

  test("cssUrls finds a url() in a nested rule", () => {
    expect(cssUrls(parseCss(".slide { .hero { background: url(a.png) } }"))).toEqual([
      { value: "a.png", line: 1 },
    ]);
  });

  test("cssDeclarations reads nested rules with their selector resolved", () => {
    expect(parseCss(nested).decls.map((d) => [d.selector, d.property, d.value, d.line])).toEqual([
      [".slide", "--fg", "#111", 2],
      [".slide .hero", "background", "url(assets/a.png)", 3],
      [".slide .hero", "color", "red", 3],
      [".slide:hover", "border-color", "#f00", 4],
      [".slide", "padding", "10px", 5],
    ]);
  });

  test("cssClassNames sees the classes of nested selectors", () => {
    expect([...cssClassNames(parseCss(".slide { .hero { .deep {} } &.dark {} }"))].sort()).toEqual([
      "dark",
      "deep",
      "hero",
      "slide",
    ]);
  });

  test("a nested rule is not an outermost selector", () => {
    expect(outermostSelectors(parseCss(nested)).map((rule) => rule.selector)).toEqual([".slide"]);
  });

  test("replaceUrls rewrites a nested url()", () => {
    const css = ".slide { .hero { background: url(a.png) } }";
    expect(
      rewriteCss(
        parseCss(css),
        replaceUrls(() => "b.png"),
      ),
    ).toBe('.slide { .hero { background: url("b.png") } }');
  });
});

describe("isScopedThemeSelector", () => {
  test("keeps a list inside :is() whole", () => {
    expect(isScopedThemeSelector(".slide :is(.a, .b)")).toBe(true);
  });

  test("accepts .slide followed by a sibling combinator", () => {
    expect(isScopedThemeSelector(".slide+.x")).toBe(true);
    expect(isScopedThemeSelector(".slide~.x")).toBe(true);
  });

  test("still rejects a part that is not under .slide", () => {
    expect(isScopedThemeSelector(".slide .a, body")).toBe(false);
    expect(isScopedThemeSelector(".slides")).toBe(false);
  });
});

describe("scopeSlideCss keyframes", () => {
  test("leaves a keyframes name written in a string alone", () => {
    const out = scopeSlideCss(
      '@keyframes pop { to { opacity: 1; } }\n.a::before { content: "@keyframes pop"; animation: pop 1s; }',
      "usb",
    );
    expect(out).toContain('content: "@keyframes pop"');
    expect(out).toContain("animation: usb--pop 1s");
    expect(out).toContain("@keyframes usb--pop {");
  });

  test("renames an animation in a nested rule, not a name inside a string", () => {
    const out = scopeSlideCss(
      '@keyframes pop { to { opacity: 1; } }\n.a { &:hover { animation-name: pop; } --label: "pop"; }',
      "usb",
    );
    expect(out).toContain("animation-name: usb--pop;");
    expect(out).toContain('--label: "pop"');
  });
});

describe("minifyCss and the scanner agree on strings", () => {
  test("an unclosed string ends at the newline, as CSS reads it", () => {
    expect(minifyCss('.a { content: "x\n; color: red; }')).toBe('.a { content: "x ; color: red; }');
  });
});

describe("nesting in the rewrites", () => {
  test("scopeSlideCss scopes the outer rule only; nested ones follow it", () => {
    expect(scopeSlideCss(".card { .hero { opacity: 0; } &:hover { opacity: 1; } }", "usb")).toBe(
      '.slide:where([data-slug="usb"]) .card { .hero { opacity: 0; } &:hover { opacity: 1; } }',
    );
  });

  test("themeExcerpt keeps a nested rule the slide selects, written out in full", () => {
    const excerpt = themeExcerpt(
      parseCss(
        ".slide { .card { color: var(--fg); } .tag { color: var(--fg); } }\n.slide { --fg: #111; }",
      ),
      { classes: ["card"] },
    );
    expect(excerpt).toContain(".slide .card {\n  color: var(--fg);\n}");
    expect(excerpt).not.toContain(".tag");
    expect(excerpt).toContain("--fg: #111;");
  });
});
