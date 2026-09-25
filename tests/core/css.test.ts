import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  cssAtRuleNames,
  cssClassNames,
  cssCustomProperties,
  cssDeclarations,
  cssLayoutNames,
  cssUrls,
  minifyCss,
  scopeSlideCss,
  themeExcerpt,
  topLevelSelectors,
} from "../../src/core/css.ts";
import { lintDeck } from "../../src/core/index.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

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
    const names = cssClassNames(`
.slide { width: 1280px; }
.slide-title, .is-shown { opacity: 1; }
.slide.foo { color: red; }
`);
    expect(names).toEqual(new Set(["slide", "slide-title", "is-shown", "foo"]));
  });

  test("ignores dots inside url() and numeric literals", () => {
    const names = cssClassNames(`
.slide {
  background: url("fonts/Inter.woff2");
  background-image: url(foo.bar.png);
  opacity: 0.4;
}
`);
    expect(names).toEqual(new Set(["slide"]));
    expect(names.has("woff2")).toBe(false);
    expect(names.has("bar")).toBe(false);
  });

  test("collects classes inside @media", () => {
    const names = cssClassNames(`
@media (min-width: 800px) {
  .slide .extra { display: block; }
}
`);
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

describe("cssCustomProperties", () => {
  test("collects custom properties from the .slide rule", () => {
    const names = cssCustomProperties(`
.slide {
  --fg: #fff;
  --bg: #111;
  color: var(--fg);
}
.slide .node { --fg: #000; }
`);
    expect(names).toEqual(new Set(["--fg", "--bg"]));
  });

  test("ignores custom properties on descendant and layout selectors", () => {
    const names = cssCustomProperties(`
.slide .node { --fg: #000; }
.slide[data-layout="title"] { --pad: 0; }
`);
    expect(names.size).toBe(0);
  });

  test("ignores custom properties inside comments", () => {
    const names = cssCustomProperties(`
.slide {
  /* --fg: #fff; */
  --bg: #111;
}
`);
    expect(names).toEqual(new Set(["--bg"]));
  });
});

describe("cssDeclarations", () => {
  test("walks declarations including nested at-rules and reports lines", () => {
    const decls = cssDeclarations(`
.slide { --fg: #fff; color: var(--fg); }
@media (prefers-reduced-motion: reduce) {
  .slide { transition: none; }
}
@keyframes fade-in {
  from { opacity: 0; }
}
`);
    expect(decls).toMatchObject([
      { selector: ".slide", property: "--fg", value: "#fff", line: 2 },
      { selector: ".slide", property: "color", value: "var(--fg)", line: 2 },
      { selector: ".slide", property: "transition", value: "none", line: 4 },
      { selector: "from", property: "opacity", value: "0", line: 7 },
    ]);
  });
});

const braceInString = `.slide .a::before { content: "}"; color: var(--fg); }
.slide .b { content: '{'; color: var(--fg); }
.slide .c { background: url("x}y.png"); }
body { color: red; }`;

describe("string-aware scanning", () => {
  test("cssClassNames sees every class when a value contains a brace", () => {
    expect([...cssClassNames(braceInString)].sort()).toEqual(["a", "b", "c", "slide"]);
  });

  test("topLevelSelectors reports only the real top-level rules", () => {
    expect(topLevelSelectors(braceInString)).toEqual([
      ".slide .a::before",
      ".slide .b",
      ".slide .c",
      "body",
    ]);
  });

  test("cssDeclarations keeps selector, property, value, and line intact", () => {
    const decls = cssDeclarations(braceInString);
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
    expect([...cssClassNames(css)].sort()).toEqual(["q", "r", "slide"]);
    expect(topLevelSelectors(css)).toEqual([".slide .q::after", ".slide .r"]);
  });

  test("a brace in a string inside @media does not leak rules to the top level", () => {
    const css = `@media (min-width: 1px) { .slide .m::before { content: "}"; } }\n.slide .n { color: var(--fg); }`;
    expect(topLevelSelectors(css)).toEqual([".slide .n"]);
    expect([...cssClassNames(css)].sort()).toEqual(["m", "n", "slide"]);
  });

  test("cssCustomProperties reads tokens after a string-bearing rule", () => {
    const css = `.slide .x::before { content: "{"; }\n.slide { --fg: #fff; }`;
    expect([...cssCustomProperties(css)]).toEqual(["--fg"]);
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
  const excerpt = themeExcerpt(theme, { classes: ["slide", "card"], layout: "title" });

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

  test("follows tokens and keyframes the slide's own stylesheet uses", () => {
    const own = themeExcerpt(theme, {
      classes: ["slide"],
      css: ".slide .mine { color: var(--bg); animation: spin 1s; }",
    });
    expect(own).toContain("--bg: #fff;");
    expect(own).toContain("@keyframes spin {");
  });
});

describe("scanners share the string-aware rule walker", () => {
  test("cssAtRuleNames lists block and statement at-rules, not an @ inside a string", () => {
    const css = `@import "x.css";
.a::before { content: "@ not a rule"; }
@media (min-width: 1px) { .b { color: red; } }
@font-face { font-family: "F"; }
`;
    expect(cssAtRuleNames(css)).toEqual(["import", "media", "font-face"]);
  });

  test("cssUrls reads url() from declaration values, with lines, not from strings", () => {
    const css = `.a::before { content: "url(not-a-ref.png)"; }
.b {
  background: url("assets/bg.png");
  mask: url(assets/m.svg) no-repeat;
}
`;
    expect(cssUrls(css)).toEqual([
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
    expect(cssUrls(css)).toEqual([
      { value: "assets/f.woff2", line: 3 },
      { value: "assets/f.woff", line: 3 },
      { value: "assets/p.woff2", line: 5 },
    ]);
  });

  test("cssLayoutNames reads data-layout from selectors, not from values", () => {
    const css = `.slide[data-layout="title"] { --x: '[data-layout=fake]'; }
.slide[data-layout=split] .a { color: red; }
`;
    expect([...cssLayoutNames(css)].sort()).toEqual(["split", "title"]);
  });
});
