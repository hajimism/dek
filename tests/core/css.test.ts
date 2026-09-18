import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { cssClassNames, cssCustomProperties, cssDeclarations } from "../../src/core/css.ts";
import { lintDeck } from "../../src/core/index.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const titleSlide = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

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
    expect(decls).toEqual([
      { selector: ".slide", property: "--fg", value: "#fff", line: 2 },
      { selector: ".slide", property: "color", value: "var(--fg)", line: 2 },
      { selector: ".slide", property: "transition", value: "none", line: 4 },
      { selector: "from", property: "opacity", value: "0", line: 7 },
    ]);
  });
});
