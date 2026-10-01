import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RULES, type RuleId } from "../../src/core/diagnostic.ts";
import { DekcError } from "../../src/core/error.ts";
import { lintDeck, lintProject } from "../../src/core/lint.ts";
import { resolveDeck } from "../../src/core/resolve.ts";
import { syncDeck } from "../../src/core/sync.ts";
import { slideDocument } from "../helpers/html.ts";
import { type DeckSpec, withTempProject } from "../helpers/project.ts";

const titleSlide = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

describe("lintDeck", () => {
  test("returns no diagnostics for a matching script and slides", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: { intro: titleSlide },
          },
        ],
      },
      async (root) => {
        expect(lintDeck(join(root, "decks", "demo"))).toEqual([]);
      },
    );
  });

  test("lints a parsed deck without re-reading script.md", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: titleSlide } }],
      },
      async (root) => {
        const resolved = resolveDeck(join(root, "decks", "demo"));
        await writeFile(join(root, "decks", "demo", "script.md"), "this is not a deck\n");
        expect(() => lintDeck(resolved.deck.dir)).toThrow(DekcError);
        expect(lintDeck(resolved)).toEqual([]);
      },
    );
  });

  test("DEKC006: data-slug does not match the section id", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: {
              intro: slideDocument(
                `<section class="slide" data-slug="other" data-layout="title"><h2 class="slide-title">intro</h2></section>`,
              ),
            },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.some((d) => d.id === "DEKC006")).toBe(true);
        const dekc006 = diagnostics.find((d) => d.id === "DEKC006");
        expect(dekc006?.path).toContain("slides/intro.html");
        expect(dekc006?.message).toContain("other");
        expect(dekc006?.slug).toBe("intro");
      },
    );
  });

  test("DEKC001: script.md has a section with no HTML", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const diagnostics = lintDeck(join(root, "decks", "demo"));
      expect(diagnostics.some((d) => d.id === "DEKC001")).toBe(true);
      const dekc001 = diagnostics.find((d) => d.id === "DEKC001");
      expect(dekc001?.path).toBe(join(root, "decks", "demo", "script.md"));
      expect(dekc001?.line).toBe(5);
      expect(dekc001?.data).toEqual({ expected: "slides/intro.html" });
    });
  });

  test('DEKC007: a slide file with no <section class="slide"> is an error, not a DEKC001', async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: "<div>intro</div>\n" } }] },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.map((d) => d.id)).toEqual(["DEKC007"]);
        expect(diagnostics[0]).toMatchObject({
          severity: "error",
          message: 'slides/intro.html has no <section class="slide">',
          path: join(root, "decks", "demo", "slides", "intro.html"),
          slug: "intro",
          hint: expect.stringContaining('<section class="slide">'),
        });
      },
    );
  });

  test('DEKC009: a second <section class="slide"> in one file is an error; only the first shows', async () => {
    const twoSections = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">one</h2>
</section>
<section class="slide" data-layout="title">
  <h2 class="slide-title">two</h2>
</section>`);
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: twoSections } }] },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics).toEqual([
          {
            id: "DEKC009",
            severity: "error",
            message: 'slides/intro.html has 2 <section class="slide">; only the first is shown',
            path: join(root, "decks", "demo", "slides", "intro.html"),
            line: 11,
            column: 1,
            slug: "intro",
            hint: "one file is one slide: add a ## section to script.md and move the rest into its file",
            data: { sections: 2 },
          },
        ]);
      },
    );
  });

  test("DEKC019: a data-layout the theme does not define is an error that lists the layouts", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: {
              intro: slideDocument(`<section class="slide" data-layout="titel">
  <h2 class="slide-title">intro</h2>
</section>`),
            },
          },
        ],
      },
      async (root) => {
        const found = lintDeck(join(root, "decks", "demo")).filter((d) => d.id === "DEKC019");
        expect(found).toEqual([
          {
            id: "DEKC019",
            severity: "error",
            message: 'data-layout "titel" is not a layout of the theme',
            path: join(root, "decks", "demo", "slides", "intro.html"),
            line: 8,
            column: 26,
            slug: "intro",
            hint: "did you mean title? run `dekc theme` to see the layouts",
            data: {
              layout: "titel",
              layouts: ["default", "full-bleed", "quote", "title", "two-col"],
            },
          },
        ]);
      },
    );
  });

  test("DEKC019: a layout the slide's own stylesheet defines is fine", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: {
              intro: slideDocument(`<section class="slide" data-layout="poster">
  <h2 class="slide-title">intro</h2>
</section>`),
            },
            styles: { intro: '.slide[data-layout="poster"] { display: grid; }\n' },
          },
        ],
      },
      async (root) => {
        expect(lintDeck(join(root, "decks", "demo")).filter((d) => d.id === "DEKC019")).toEqual([]);
      },
    );
  });

  test("DEKC044: a # or #### heading in the script is spoken as text; a warning says so", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script:
              "---\ntitle: Demo\n---\n\n# Part one\n\n## intro\n\nhello\n\n#### aside\n\nmore\n",
            slides: { intro: titleSlide },
          },
        ],
      },
      async (root) => {
        const script = join(root, "decks", "demo", "script.md");
        const found = lintDeck(join(root, "decks", "demo")).filter((d) => d.id === "DEKC044");
        expect(found).toEqual([
          {
            id: "DEKC044",
            severity: "warning",
            message: "# heading is not a slide or a beat; it is read as spoken text",
            path: script,
            line: 5,
            hint: "use ## for a slide and ### for a beat, or drop the #",
            data: { level: 1 },
          },
          {
            id: "DEKC044",
            severity: "warning",
            message: "#### heading is not a slide or a beat; it is read as spoken text",
            path: script,
            line: 11,
            slug: "intro",
            hint: "use ## for a slide and ### for a beat, or drop the #",
            data: { level: 4 },
          },
        ]);
      },
    );
  });

  test("DEKC021: a missing image that the project has names the copy to make", async () => {
    await withTempProject(
      {
        assets: { "logo.png": "png" },
        decks: [
          {
            name: "demo",
            slides: {
              intro: slideDocument(`<section class="slide" data-layout="title">
  <img src="assets/logo.png" alt="logo">
</section>`),
            },
          },
        ],
      },
      async (root) => {
        const found = lintDeck(join(root, "decks", "demo")).find((d) => d.id === "DEKC021");
        expect(found?.hint).toBe(
          "the project has it: copy ../../assets/logo.png into the deck's assets/",
        );
      },
    );
  });

  test("DEKC008: a misspelled dekc.toml key is a project warning that names the key it meant", async () => {
    await withTempProject(
      {
        toml: '# project\nlatin_per_minut = 150\n\n[voice]\nspeaker = "a"\nsped = 1.2\n',
        decks: [{ name: "demo", slides: { intro: titleSlide } }],
      },
      async (root) => {
        // Once per project, not once per deck.
        expect(lintDeck(join(root, "decks", "demo"))).toEqual([]);
        expect(lintProject(resolveDeck(join(root, "decks", "demo")).project)).toEqual([
          {
            id: "DEKC008",
            severity: "warning",
            message: "unknown key latin_per_minut in dekc.toml; dekc ignores it",
            path: join(root, "dekc.toml"),
            line: 2,
            hint: "did you mean latin_per_minute?",
            data: { file: "dekc.toml", key: "latin_per_minut", suggestion: "latin_per_minute" },
          },
          {
            id: "DEKC008",
            severity: "warning",
            message: "unknown key voice.sped in dekc.toml; dekc ignores it",
            path: join(root, "dekc.toml"),
            line: 6,
            hint: "did you mean voice.speed?",
            data: { file: "dekc.toml", key: "voice.sped", suggestion: "voice.speed" },
          },
        ]);
      },
    );
  });

  test("DEKC008: an unknown frontmatter key is a warning; a close one names the key it meant", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: "---\ntitle: Demo\ndurration: 5m\nvenue: Tokyo\n---\n\n## intro\n\nhello\n",
            slides: { intro: titleSlide },
          },
        ],
      },
      async (root) => {
        const script = join(root, "decks", "demo", "script.md");
        const found = lintDeck(join(root, "decks", "demo")).filter((d) => d.id === "DEKC008");
        expect(found).toEqual([
          {
            id: "DEKC008",
            severity: "warning",
            message: "unknown key durration in the frontmatter; dekc ignores it",
            path: script,
            line: 3,
            hint: "did you mean duration?",
            data: { file: "frontmatter", key: "durration", suggestion: "duration" },
          },
          {
            id: "DEKC008",
            severity: "warning",
            message: "unknown key venue in the frontmatter; dekc ignores it",
            path: script,
            line: 4,
            hint: "the keys are title, description, event, date, duration, ratio, lang; see https://hajimism.github.io/dekc/reference/config.html#frontmatter",
            data: { file: "frontmatter", key: "venue" },
          },
        ]);
      },
    );
  });

  test("DEKC018: a deck with no theme.css is an error, not a silently unstyled pass", async () => {
    await withTempProject(
      { decks: [{ name: "demo", theme: null, slides: { intro: titleSlide } }] },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics).toEqual([
          {
            id: "DEKC018",
            severity: "error",
            message: "theme.css not found",
            path: join(root, "decks", "demo", "theme.css"),
            hint: expect.stringContaining("copy theme.css"),
          },
        ]);
      },
    );
  });

  test("DEKC002: slides/ has HTML with no section", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: {
              intro: titleSlide,
              leftover: titleSlide,
            },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.some((d) => d.id === "DEKC002")).toBe(true);
        const dekc002 = diagnostics.find((d) => d.id === "DEKC002");
        expect(dekc002?.path).toContain("slides/leftover.html");
        expect(dekc002?.hint).toBe(
          "add a section for it to script.md, like `## Leftover {#leftover}`, or remove slides/leftover.html if the slide is gone from the talk",
        );
      },
    );
  });

  test("DEKC003: data-step is neither a beat id nor a positive integer", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## intro

### hook {#hook}

body
`,
            slides: {
              intro: slideDocument(`<section class="slide" data-layout="default">
  <h2 class="slide-title">intro</h2>
  <ul>
    <li data-step="missing">gone</li>
  </ul>
</section>`),
            },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.some((d) => d.id === "DEKC003")).toBe(true);
      },
    );
  });

  test("DEKC004: duplicate section slugs in a deck", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## intro

one

## intro

two
`,
            slides: {
              intro: titleSlide,
            },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.some((d) => d.id === "DEKC004")).toBe(true);
      },
    );
  });

  test("DEKC004: duplicate beat ids in a section", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## intro

### hook {#hook}

a

### also {#hook}

b
`,
            slides: {
              intro: slideDocument(`<section class="slide" data-layout="default">
  <h2 class="slide-title">intro</h2>
  <ul>
    <li data-step="hook">hook</li>
  </ul>
</section>`),
            },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.some((d) => d.id === "DEKC004")).toBe(true);
      },
    );
  });

  test("DEKC005: duplicate data-morph names in one slide", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: {
              intro: slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <img data-morph="pipeline" alt="">
  <img data-morph="pipeline" alt="">
</section>`),
            },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.some((d) => d.id === "DEKC005")).toBe(true);
      },
    );
  });

  test("DEKC005: a data-morph name the player reserves", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: {
              intro: slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <img data-morph="slide" alt="">
  <img data-morph="root" alt="">
  <img data-morph="pipeline" alt="">
</section>`),
            },
          },
        ],
      },
      async (root) => {
        const found = lintDeck(join(root, "decks", "demo")).filter((d) => d.id === "DEKC005");
        expect(found.map((d) => d.data?.morph)).toEqual(["slide", "root"]);
        expect(found[0]?.message).toContain("reserved");
        expect(found[0]?.hint).toContain("rename");
        expect(found[1]?.line).toBe((found[0]?.line ?? 0) + 1);
      },
    );
  });

  describe("DEKC028: a data-morph with nothing to morph into", () => {
    const three = `---\ntitle: Demo\n---\n\n## a {#a}\n\nx\n\n## b {#b}\n\ny\n\n## c {#c}\n\nz\n`;
    const slide = (body: string) =>
      slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">t</h2>
${body}
</section>`);

    function lintThree(slides: Record<string, string>) {
      return withTempProject({ decks: [{ name: "demo", script: three, slides }] }, async (root) =>
        lintDeck(join(root, "decks", "demo")).filter((d) => d.id === "DEKC028"),
      );
    }

    test("is quiet when the slide before or after has the same name", async () => {
      const found = await lintThree({
        a: slide(`  <p data-morph="n">840</p>`),
        b: slide(`  <p data-morph="n">840</p>\n  <img data-morph="chart" alt="">`),
        c: slide(`  <img data-morph="chart" alt="">`),
      });
      expect(found).toEqual([]);
    });

    test("warns on the element, naming the slides it could go to", async () => {
      const found = await lintThree({
        a: slide(`  <p>x</p>`),
        b: slide(`  <p data-morph="p99">840</p>`),
        c: slide(`  <p>z</p>`),
      });
      expect(found).toEqual([
        expect.objectContaining({
          severity: "warning",
          slug: "b",
          path: expect.stringMatching(/\/slides\/b\.html$/),
          line: 10,
          message: 'data-morph "p99" is on neither slide beside it, so nothing morphs',
          hint: 'give its partner data-morph="p99" in slides/a.html or slides/c.html, or remove it',
          data: { morph: "p99", neighbors: ["a", "c"] },
        }),
      ]);
    });

    test("does not count a slide two away", async () => {
      const found = await lintThree({
        a: slide(`  <p data-morph="n">x</p>`),
        b: slide(`  <p>y</p>`),
        c: slide(`  <p data-morph="n">z</p>`),
      });
      expect(found.map((d) => d.slug)).toEqual(["a", "c"]);
      expect(found[0]?.hint).toBe('give its partner data-morph="n" in slides/b.html, or remove it');
    });

    test("suggests the name next door it was probably meant to match", async () => {
      const found = await lintThree({
        a: slide(`  <p data-morph="p99">840</p>`),
        b: slide(`  <p data-morph="p-99">840</p>`),
        c: slide(`  <p>z</p>`),
      });
      expect(found.map((d) => d.hint)).toEqual([
        'did you mean "p-99", as in slides/b.html?',
        'did you mean "p99", as in slides/a.html?',
      ]);
    });

    test("leaves reserved names to DEKC005", async () => {
      const found = await lintThree({
        a: slide(`  <p data-morph="slide">x</p>`),
        b: slide(`  <p>y</p>`),
        c: slide(`  <p>z</p>`),
      });
      expect(found).toEqual([]);
    });
  });

  const vocabTheme = `.slide {}
.slide .slide-title {}
.slide .node {}
.slide[data-layout="title"] {}
`;

  test("DEKC010: class not defined in the deck theme", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: vocabTheme,
            slides: {
              intro: slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title mystery">intro</h2>
</section>`),
            },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.some((d) => d.id === "DEKC010")).toBe(true);
      },
    );
  });

  test("DEKC011: inline style element in a slide", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: {
              intro: slideDocument(`<section class="slide" data-layout="title">
  <style>.slide { color: red; }</style>
  <h2 class="slide-title">intro</h2>
</section>`),
            },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.some((d) => d.id === "DEKC011")).toBe(true);
      },
    );
  });

  test("DEKC011: style attribute on a slide element", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: {
              intro: slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title" style="color: red">intro</h2>
</section>`),
            },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.some((d) => d.id === "DEKC011")).toBe(true);
      },
    );
  });

  // A presentation attribute is a style written where var() cannot reach it; an SVG icon's
  // `fill="none"` or `currentColor` takes nothing from the theme and passes.
  test("DEKC014: a raw color or font in a presentation attribute", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: {
              intro: slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <svg viewBox="0 0 10 10"><circle fill="red" stroke="currentColor" r="4"/><path fill="none" d="M0 0"/></svg>
  <font color="#f00" face="Comic Sans MS">old</font>
  <table bgcolor="navy"></table>
</section>`),
            },
          },
        ],
      },
      async (root) => {
        const found = lintDeck(join(root, "decks", "demo")).filter((d) => d.id === "DEKC014");
        expect(found.map(({ message, line, hint }) => ({ message, line, hint }))).toEqual([
          {
            message: 'raw value in fill="red"; use a theme token',
            line: 10,
            hint: "set fill in slides/intro.css with a theme token instead, such as fill: var(--accent); an attribute cannot take var()",
          },
          {
            message: 'raw value in color="#f00"; use a theme token',
            line: 11,
            hint: "set color in slides/intro.css with a theme token instead, such as color: var(--accent); an attribute cannot take var()",
          },
          {
            message: 'raw value in face="Comic Sans MS"; use a theme token',
            line: 11,
            hint: "set font-family in slides/intro.css with a theme token instead, such as font-family: var(--font-body); an attribute cannot take var()",
          },
          {
            message: 'raw value in bgcolor="navy"; use a theme token',
            line: 12,
            hint: "set background-color in slides/intro.css with a theme token instead, such as background-color: var(--accent); an attribute cannot take var()",
          },
        ]);
      },
    );
  });

  // A deck carries everything it shows. A file: URL names a file on one machine, an http: URL
  // without its slashes still leaves for the network, and a link that climbs out of the deck from
  // either place a slide is read from leads to another deck.
  test("DEKC020 and DEKC022: every way a slide's address can leave the deck", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: {
              intro: slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <img src="file:///etc/hosts" alt="">
  <img src="http:cdn.example/a.png" alt="">
  <a href="../other-deck/">other</a>
  <a href="file:///Users/me/notes.html">notes</a>
  <a href="#intro">here</a>
</section>`),
            },
          },
        ],
      },
      async (root) => {
        const found = lintDeck(join(root, "decks", "demo")).filter(
          (d) => d.id === "DEKC020" || d.id === "DEKC022",
        );
        expect(found.map(({ id, line }) => ({ id, line }))).toEqual([
          { id: "DEKC022", line: 10 },
          { id: "DEKC020", line: 11 },
          { id: "DEKC022", line: 12 },
          { id: "DEKC022", line: 13 },
        ]);
      },
    );
  });

  test("DEKC011: a <link> in the slide, but not in a full document's head", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: {
              intro: slideDocument(`<section class="slide" data-layout="title">
  <link rel="stylesheet" href="assets/fonts.css">
  <h2 class="slide-title">intro</h2>
</section>`),
            },
          },
        ],
      },
      async (root) => {
        const found = lintDeck(join(root, "decks", "demo")).filter((d) => d.id === "DEKC011");
        expect(found.map(({ message, line }) => ({ message, line }))).toEqual([
          {
            message: "slide contains a <link>, which loads its stylesheet for every slide",
            line: 9,
          },
        ]);
      },
    );
  });

  test("DEKC011: script element in a slide", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: {
              intro: slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <script>console.log(1)</script>
</section>`),
            },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.some((d) => d.id === "DEKC011")).toBe(true);
      },
    );
  });

  test("DEKC012: top-level selector in theme.css", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: `body { color: red; }
.slide { width: 1280px; }
`,
            slides: { intro: titleSlide },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.some((d) => d.id === "DEKC012")).toBe(true);
      },
    );
  });

  test("DEKC012: allows .slide, view-transition, and at-rules", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: `.slide { width: 100%; }
.slide .slide-title { margin: 0; }
::view-transition-old(root) { animation: fade-out var(--step-transition); }
::view-transition-new(root) { animation: fade-in var(--step-transition); }
@keyframes fade-out { from { opacity: 1; } to { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .slide { animation: none; }
}
`,
            slides: { intro: titleSlide },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.some((d) => d.id === "DEKC012")).toBe(false);
      },
    );
  });

  test("DEKC010/DEKC012 stay quiet when theme.css has a brace inside content", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: `.slide {
  --fg: #fff;
  --bg: #111;
  --accent: #f00;
  --muted: #888;
  --font-title: inherit;
  --font-body: inherit;
  --size-title: 1em;
  --size-body: 1em;
  --size-caption: 1em;
  --gap: 1em;
  --pad: 1em;
  --radius: 0;
  --step-transition: 0s;
}
.slide .brace::before { content: "}"; }
.slide .after { color: var(--fg); }
`,
            slides: {
              intro: slideDocument(
                `<section class="slide"><p class="brace"></p><p class="after"></p></section>`,
              ),
            },
          },
        ],
      },
      async (root) => {
        expect(
          lintDeck(join(root, "decks", "demo")).filter(
            (d) => d.id === "DEKC010" || d.id === "DEKC012",
          ),
        ).toEqual([]);
      },
    );
  });

  test("DEKC013: theme class count exceeds the default of 40", async () => {
    const classes = Array.from({ length: 41 }, (_, i) => `.slide .c${i} {}`).join("\n");
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: `.slide {}\n${classes}\n`,
            slides: { intro: titleSlide },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.some((d) => d.id === "DEKC013")).toBe(true);
      },
    );
  });

  test("DEKC013: max_classes in dekc.toml raises the limit", async () => {
    const classes = Array.from({ length: 41 }, (_, i) => `.slide .c${i} {}`).join("\n");
    await withTempProject(
      {
        toml: "max_classes = 50\n",
        decks: [
          {
            name: "demo",
            theme: `.slide {}\n${classes}\n`,
            slides: { intro: titleSlide },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.some((d) => d.id === "DEKC013")).toBe(false);
      },
    );
  });

  const contractTokens = [
    "--fg",
    "--bg",
    "--accent",
    "--muted",
    "--font-title",
    "--font-body",
    "--size-title",
    "--size-body",
    "--size-caption",
    "--gap",
    "--pad",
    "--radius",
    "--step-transition",
  ] as const;

  function themeWithTokens(names: readonly string[], extra = ""): string {
    const decls = names.map((name) => `  ${name}: initial;`).join("\n");
    return `.slide {\n${decls}\n${extra}}\n`;
  }

  test("DEKC015: missing required token on .slide", async () => {
    const names = contractTokens.filter((name) => name !== "--accent");
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: themeWithTokens(names),
            slides: { intro: titleSlide },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        const dekc015 = diagnostics.filter((d) => d.id === "DEKC015");
        expect(dekc015).toHaveLength(1);
        expect(dekc015[0]?.message).toContain("--accent");
        expect(dekc015[0]?.path).toContain("theme.css");
        // The value dekc's own theme gives it, so the fix can be written as is.
        expect(dekc015[0]?.hint).toMatch(
          /^add --accent: #[0-9a-f]+; to the \.slide rule in theme\.css, as dekc's own theme sets it$/,
        );
      },
    );
  });

  test("DEKC010: offers no empty list when the theme defines no class", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: themeWithTokens(contractTokens),
            slides: {
              intro: slideDocument(`<section class="slide"><p class="lede">x</p></section>`),
            },
          },
        ],
      },
      async (root) => {
        const dekc010 = lintDeck(join(root, "decks", "demo")).find((d) => d.id === "DEKC010");
        expect(dekc010?.hint).toBe(
          "define it in slides/intro.css, or in theme.css for every slide; the theme defines no class yet",
        );
      },
    );
  });

  test("DEKC015: does not fire when the contract is published", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: themeWithTokens(contractTokens),
            slides: { intro: titleSlide },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.some((d) => d.id === "DEKC015")).toBe(false);
      },
    );
  });

  test("DEKC015: extra custom properties are allowed", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: themeWithTokens(contractTokens, "  --extra: 1;\n"),
            slides: { intro: titleSlide },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.some((d) => d.id === "DEKC015")).toBe(false);
      },
    );
  });

  async function lintThemeCss(css: string): Promise<string[]> {
    let ids: string[] = [];
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: `${themeWithTokens(contractTokens)}\n${css}`,
            slides: { intro: titleSlide },
          },
        ],
      },
      async (root) => {
        ids = lintDeck(join(root, "decks", "demo")).map((d) => d.id);
      },
    );
    return ids;
  }

  test("DEKC014: raw color outside a custom property", async () => {
    const ids = await lintThemeCss(".slide { color: #f00; }\n");
    expect(ids).toContain("DEKC014");
  });

  test("DEKC014: raw px outside a custom property", async () => {
    const ids = await lintThemeCss(".slide { padding: 16px; }\n");
    expect(ids).toContain("DEKC014");
  });

  test("DEKC014: raw font-family outside a custom property", async () => {
    const ids = await lintThemeCss(".slide { font-family: sans-serif; }\n");
    expect(ids).toContain("DEKC014");
  });

  test("DEKC014: var() fallback", async () => {
    const ids = await lintThemeCss(".slide { color: var(--fg, #fff); }\n");
    expect(ids).toContain("DEKC014");
  });

  test("DEKC014: allows token assignment, var, calc, 0, thin, and em", async () => {
    const ids = await lintThemeCss(`
.slide {
  color: var(--fg);
  padding: calc(var(--gap) * 0.75);
  margin: 0;
  border: thin solid var(--muted);
  transform: translateY(0.5em);
}
`);
    expect(ids).not.toContain("DEKC014");
    expect(ids).not.toContain("DEKC015");
  });

  test("DEKC020: remote URL reference", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: {
              intro: slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <img src="https://cdn.example.com/logo.png" alt="">
</section>`),
            },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.some((d) => d.id === "DEKC020")).toBe(true);
      },
    );
  });

  test("DEKC021: missing local image", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: {
              intro: slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <img src="assets/missing.png" alt="">
</section>`),
            },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.some((d) => d.id === "DEKC021")).toBe(true);
      },
    );
  });

  test("DEKC022: path escapes the deck directory", async () => {
    await withTempProject(
      {
        assets: { "logo.svg": "<svg xmlns='http://www.w3.org/2000/svg'></svg>\n" },
        decks: [
          {
            name: "demo",
            slides: {
              intro: slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <img src="../../assets/logo.svg" alt="">
</section>`),
            },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.some((d) => d.id === "DEKC022")).toBe(true);
      },
    );
  });

  test("DEKC022: allows ../theme.css and deck-local assets", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            assets: { "logo.svg": "<svg xmlns='http://www.w3.org/2000/svg'></svg>\n" },
            slides: {
              intro: slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <img src="assets/logo.svg" alt="">
</section>`),
            },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.some((d) => d.id === "DEKC022")).toBe(false);
        expect(diagnostics.some((d) => d.id === "DEKC021")).toBe(false);
      },
    );
  });

  test("DEKC023: src that reaches assets through ../ is flagged", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            assets: { "pixel.png": "png" },
            slides: {
              intro: slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <img src="../assets/pixel.png" alt="">
</section>`),
            },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const diagnostics = lintDeck(deckDir).filter((d) => d.id === "DEKC023");
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          path: join(deckDir, "slides", "intro.html"),
          slug: "intro",
        });
        expect(diagnostics[0]?.message).toContain("assets/pixel.png");
      },
    );
  });

  test("DEKC023: deck-relative assets/ src, data:, #, and link href are not flagged", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            assets: { "pixel.png": "png" },
            slides: {
              intro: slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <img src="assets/pixel.png" alt="">
  <img src="data:image/png;base64,AA" alt="">
  <a href="#x">here</a>
</section>`),
            },
          },
        ],
      },
      async (root) => {
        expect(lintDeck(join(root, "decks", "demo")).filter((d) => d.id === "DEKC023")).toEqual([]);
      },
    );
  });

  test("DEKC023: does not double-report with DEKC020 or DEKC022", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: {
              intro: slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <img src="https://x/y.png" alt="">
  <img src="../../outside.png" alt="">
</section>`),
            },
          },
        ],
      },
      async (root) => {
        const ids = lintDeck(join(root, "decks", "demo")).map((d) => d.id);
        expect(ids).toContain("DEKC020");
        expect(ids).toContain("DEKC022");
        expect(ids).not.toContain("DEKC023");
      },
    );
  });

  test("accepts the README architecture example against the default theme", async () => {
    const theme = await Bun.file(
      join(import.meta.dir, "..", "..", "src", "theme", "default.css"),
    ).text();
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme,
            script: `---
title: Demo
---

## architecture

### script.md が親 {#script-parent}

a

### スライドがぶら下がる {#slides-hang}

b
`,
            slides: {
              architecture: slideDocument(`<section class="slide" data-layout="two-col">
  <h2 class="slide-title">script.md が親</h2>
  <div class="col">
    <p class="node">script.md</p>
    <p class="node node-parent" data-step="script-parent">script.md ← 親</p>
  </div>
  <div class="col" data-step="slides-hang">
    <p class="node">intro.html</p>
    <p class="node">architecture.html</p>
  </div>
</section>`),
            },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.filter((d) => d.id === "DEKC010")).toEqual([]);
      },
    );
  });

  test("suggests dekc mv when one DEKC001 and one DEKC002", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: { leftover: titleSlide },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.some((d) => d.id === "DEKC001")).toBe(true);
        expect(diagnostics.some((d) => d.id === "DEKC002")).toBe(true);
        const hints = diagnostics.filter((d) => d.id === "DEKC001" || d.id === "DEKC002");
        expect(hints.map((d) => d.hint)).toEqual([
          "run `dekc mv leftover intro` to move the files to the script's id, or `dekc mv intro leftover` to give the section the files' id",
          "run `dekc mv leftover intro` to move the files to the script's id, or `dekc mv intro leftover` to give the section the files' id",
        ]);
      },
    );
  });

  test("DEKC043: flags a voice.toml beat key that matches no slide or beat", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## intro

こんにちは
`,
            slides: { intro: titleSlide },
          },
        ],
      },
      async (root) => {
        const dir = join(root, "decks", "demo", "voice");
        await mkdir(dir, { recursive: true });
        await writeFile(
          join(dir, "voice.toml"),
          `speaker = "ずんだもん/ノーマル"\n\n[beats.intro]\nlead = 0\n\n[beats."intro/gone"]\nlead = 0\n`,
        );
        const found = lintDeck(join(root, "decks", "demo")).filter((d) => d.id === "DEKC043");
        expect(found).toHaveLength(1);
        expect(found[0]?.message).toContain("intro/gone");
      },
    );
  });

  // A voice.toml that does not read stops narration, not the talk: lint says why and carries on,
  // since everything else about the deck can still be checked.
  test("DEKC045: a voice.toml or dict.toml that cannot be read, and the rest of lint still runs", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: "---\ntitle: Demo\n---\n\n## intro\n\nこんにちは\n\n## gone\n",
            slides: { intro: titleSlide },
          },
        ],
      },
      async (root) => {
        const dir = join(root, "decks", "demo", "voice");
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, "voice.toml"), 'speaker = 3\nspeed = "fast"\n');
        await writeFile(join(dir, "dict.toml"), "API = \n");
        const found = lintDeck(join(root, "decks", "demo"));
        expect(
          found
            .filter((d) => d.id === "DEKC045")
            .map(({ severity, path, message }) => ({
              severity,
              file: path?.split("/").pop(),
              message,
            })),
        ).toEqual([
          {
            severity: "warning",
            file: "voice.toml",
            message:
              "speaker: Invalid input: expected string, received number; speed: Invalid input: expected number, received string",
          },
          {
            severity: "warning",
            file: "dict.toml",
            message: expect.stringContaining("dict.toml"),
          },
        ]);
        expect(found.some((d) => d.id === "DEKC001")).toBe(true);
      },
    );
  });

  test("DEKC040: flags English words missing from the deck dictionary when voice/ exists", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## intro

hello dekc
`,
            slides: { intro: titleSlide },
          },
        ],
      },
      async (root) => {
        const dir = join(root, "decks", "demo", "voice");
        await mkdir(dir, { recursive: true });
        await writeFile(
          join(dir, "voice.toml"),
          `engine = "voicevox"\nspeaker = "ずんだもん/ノーマル"\n`,
        );
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.some((d) => d.id === "DEKC040" && d.message.includes("dekc"))).toBe(
          true,
        );
      },
    );
  });

  test("DEKC042: flags a beat with visible body but no spoken paragraph when voice/ exists", async () => {
    const script = `---
title: Demo
---

## intro

hello

### hook {#hook}

spoken

### shown {#shown}

- list only
`;
    await withTempProject(
      { decks: [{ name: "demo", script, slides: { intro: titleSlide } }] },
      async (root) => {
        expect(lintDeck(join(root, "decks", "demo")).some((d) => d.id === "DEKC042")).toBe(false);
        const dir = join(root, "decks", "demo", "voice");
        await mkdir(dir, { recursive: true });
        await writeFile(
          join(dir, "voice.toml"),
          `engine = "voicevox"\nspeaker = "ずんだもん/ノーマル"\n`,
        );
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        const dekc042 = diagnostics.find((d) => d.id === "DEKC042");
        expect(dekc042).toBeDefined();
        expect(dekc042?.message).toContain('"intro"');
        expect(dekc042?.message).toContain("beat 2");
        expect(dekc042?.message).toContain("not synthesized");
        expect(dekc042?.path).toContain("script.md");
        expect(dekc042?.line).toBe(13);
        expect(dekc042?.slug).toBe("intro");
        expect(lintDeck(join(root, "decks", "demo"), { slug: "other" })).toEqual([]);
      },
    );
  });

  test("DEKC041: flags a large gap between duration budget and Timeline length", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
duration: 10m
---

## intro

hello
`,
            slides: { intro: titleSlide },
          },
        ],
      },
      async (root) => {
        await mkdir(join(root, "decks", "demo", ".cache", "voice"), { recursive: true });
        await writeFile(
          join(root, "decks", "demo", ".cache", "voice", "timeline.json"),
          JSON.stringify({
            audio: "",
            durationMs: 1000,
            beats: [
              {
                position: { slideIndex: 0, beatIndex: 0 },
                start: 0,
                end: 1000,
                sentences: [],
              },
            ],
          }),
        );
        const dekc041 = lintDeck(join(root, "decks", "demo")).find((d) => d.id === "DEKC041");
        expect(dekc041?.data).toEqual({ actualSeconds: 1, budgetSeconds: 600, source: "timeline" });
      },
    );
  });

  test("DEKC041: without a Timeline, compares the estimated reading time to the budget", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: "---\ntitle: Demo\nduration: 5m\n---\n\n## intro\n\nこんにちは。\n",
            slides: { intro: titleSlide },
          },
        ],
      },
      async (root) => {
        const dekc041 = lintDeck(join(root, "decks", "demo")).find((d) => d.id === "DEKC041");
        expect(dekc041).toMatchObject({
          message: "the script reads in about 0:01, budget 5m; more than 35% apart",
          data: { actualSeconds: 1, budgetSeconds: 300, source: "estimate" },
          hint: "write more for the slot, or shorten duration in the frontmatter",
        });
      },
    );
  });

  test("DEKC041: stays quiet when Timeline is close to the budget", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
duration: 10m
---

## intro

hello
`,
            slides: { intro: titleSlide },
          },
        ],
      },
      async (root) => {
        await mkdir(join(root, "decks", "demo", ".cache", "voice"), { recursive: true });
        await writeFile(
          join(root, "decks", "demo", ".cache", "voice", "timeline.json"),
          JSON.stringify({
            audio: "",
            durationMs: 600_000,
            beats: [
              {
                position: { slideIndex: 0, beatIndex: 0 },
                start: 0,
                end: 600_000,
                sentences: [],
              },
            ],
          }),
        );
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.some((d) => d.id === "DEKC041")).toBe(false);
      },
    );
  });

  test("slug option skips other slides' DEKC001", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## intro

hello

## extra

more
`,
            slides: { intro: titleSlide },
          },
        ],
      },
      async (root) => {
        const diagnostics = lintDeck(join(root, "decks", "demo"), { slug: "intro" });
        expect(diagnostics.some((d) => d.id === "DEKC001")).toBe(false);
      },
    );
  });

  test("slug option leaves theme.css to the deck: DEKC012 there is not one slide's", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: "body { color: red; }\n",
            slides: { intro: titleSlide },
          },
        ],
      },
      async (root) => {
        expect(lintDeck(join(root, "decks", "demo")).some((d) => d.id === "DEKC012")).toBe(true);
        const slide = lintDeck(join(root, "decks", "demo"), { slug: "intro" });
        expect(slide.some((d) => d.id === "DEKC012")).toBe(false);
        expect(slide.every((d) => d.slug === "intro")).toBe(true);
      },
    );
  });

  test("slug option drops DEKC041, a deck finding, and filters DEKC040 to that slide", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
duration: 10m
---

## intro

hello dekc

## extra

こんにちは
`,
            slides: { intro: titleSlide, extra: titleSlide },
          },
        ],
      },
      async (root) => {
        const dir = join(root, "decks", "demo", "voice");
        await mkdir(dir, { recursive: true });
        await writeFile(
          join(dir, "voice.toml"),
          `engine = "voicevox"\nspeaker = "ずんだもん/ノーマル"\n`,
        );
        await mkdir(join(root, "decks", "demo", ".cache", "voice"), { recursive: true });
        await writeFile(
          join(root, "decks", "demo", ".cache", "voice", "timeline.json"),
          JSON.stringify({
            audio: "",
            durationMs: 1000,
            beats: [
              {
                position: { slideIndex: 0, beatIndex: 0 },
                start: 0,
                end: 1000,
                sentences: [],
              },
            ],
          }),
        );
        expect(lintDeck(join(root, "decks", "demo")).some((d) => d.id === "DEKC041")).toBe(true);
        const intro = lintDeck(join(root, "decks", "demo"), { slug: "intro" });
        expect(new Set(intro.map((d) => `${d.id} ${d.slug}`))).toEqual(new Set(["DEKC040 intro"]));
        expect(lintDeck(join(root, "decks", "demo"), { slug: "extra" })).toEqual([]);
      },
    );
  });

  test("attaches slug to DEKC001, DEKC003, and DEKC040", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## intro

hello dekc

### hook

body
`,
            slides: {
              intro: slideDocument(`<section class="slide">
  <p data-step="missing">x</p>
</section>`),
            },
          },
        ],
      },
      async (root) => {
        const dir = join(root, "decks", "demo", "voice");
        await mkdir(dir, { recursive: true });
        await writeFile(
          join(dir, "voice.toml"),
          `engine = "voicevox"\nspeaker = "ずんだもん/ノーマル"\n`,
        );
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.find((d) => d.id === "DEKC003")?.slug).toBe("intro");
        expect(diagnostics.find((d) => d.id === "DEKC040")?.slug).toBe("intro");
      },
    );
  });

  test("attaches slug to DEKC001", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const dekc001 = lintDeck(join(root, "decks", "demo")).find((d) => d.id === "DEKC001");
      expect(dekc001?.slug).toBe("intro");
    });
  });
});

describe("lintDeck hints", () => {
  const beatScript = `---
title: Demo
---

## intro

### hook {#hook}

one

### turn {#turn}

two
`;

  async function lintIntro(html: string, deck: Partial<DeckSpec> = {}) {
    let diagnostics: ReturnType<typeof lintDeck> = [];
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: slideDocument(html) }, ...deck }] },
      async (root) => {
        diagnostics = lintDeck(join(root, "decks", "demo"));
      },
    );
    return diagnostics;
  }

  test("DEKC003 lists the beat ids and indexes the slide can use", async () => {
    const diagnostics = await lintIntro(
      `<section class="slide" data-layout="default">
  <h2 class="slide-title">intro</h2>
  <p data-step="3">late</p>
</section>`,
      { script: beatScript },
    );
    const hint = diagnostics.find((d) => d.id === "DEKC003")?.hint;
    expect(hint).toBe("use hook, turn, or 1-2");
  });

  test("DEKC003 says when the section has no beats", async () => {
    const diagnostics = await lintIntro(`<section class="slide" data-layout="default">
  <h2 class="slide-title">intro</h2>
  <p data-step="1">late</p>
</section>`);
    const hint = diagnostics.find((d) => d.id === "DEKC003")?.hint;
    expect(hint).toBe('add a ### beat under "## intro" in script.md, or drop data-step');
  });

  test("DEKC025: a numeric data-step that points at a beat with an id", async () => {
    const diagnostics = await lintIntro(
      `<section class="slide" data-layout="default">
  <h2 class="slide-title">intro</h2>
  <p data-step="hook">by id</p>
  <p data-step="2">by position</p>
</section>`,
      { script: beatScript },
    );
    const found = diagnostics.filter((d) => d.id === "DEKC025");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      severity: "warning",
      slug: "intro",
      message: 'data-step "2" is beat "turn" by position; it moves if a beat is inserted before it',
      hint: 'use data-step="turn"',
      data: { step: "2", id: "turn" },
    });
  });

  test("DEKC025 stays quiet for a beat with no id, where the position is the only name", async () => {
    const diagnostics = await lintIntro(
      `<section class="slide" data-layout="default">
  <h2 class="slide-title">intro</h2>
  <p data-step="2">by position</p>
</section>`,
      { script: beatScript.replace("### turn {#turn}", "### The turn") },
    );
    expect(diagnostics.filter((d) => d.id === "DEKC025")).toEqual([]);
  });

  test("DEKC010 suggests the defined class a typo most likely meant", async () => {
    const diagnostics = await lintIntro(
      `<section class="slide" data-layout="title">
  <h2 class="slide-titel">intro</h2>
  <p class="mystery">x</p>
</section>`,
      { theme: ".slide {}\n.slide .slide-title {}\n.slide .node {}\n" },
    );
    const typo = diagnostics.find((d) => d.id === "DEKC010" && d.data?.class === "slide-titel");
    expect(typo?.hint).toBe(
      "did you mean slide-title? define it in slides/intro.css, or use one of: node, slide-title",
    );
    expect(typo?.data).toEqual({ class: "slide-titel", suggestion: "slide-title" });
    const unknown = diagnostics.find((d) => d.id === "DEKC010" && d.data?.class === "mystery");
    expect(unknown?.hint).toBe("define it in slides/intro.css, or use one of: node, slide-title");
    expect(unknown?.data).toEqual({ class: "mystery" });
  });

  test("DEKC010 names the slide stylesheet and the known classes", async () => {
    const diagnostics = await lintIntro(
      `<section class="slide" data-layout="title">
  <h2 class="slide-title mystery">intro</h2>
</section>`,
      { theme: ".slide {}\n.slide .slide-title {}\n.slide .node {}\n" },
    );
    const hint = diagnostics.find((d) => d.id === "DEKC010")?.hint;
    expect(hint).toBe("define it in slides/intro.css, or use one of: node, slide-title");
  });

  test("DEKC010 suggests a data attribute when the slide has a script to find it", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: ".slide {}\n.slide .slide-title {}\n",
            slides: {
              intro: slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title"><span class="count">0</span></h2>
</section>`),
            },
          },
        ],
      },
      async (root) => {
        await writeFile(
          join(root, "decks", "demo", "slides", "intro.ts"),
          "export default { draw() {} } satisfies DekcSlide;\n",
        );
        const hint = lintDeck(join(root, "decks", "demo")).find((d) => d.id === "DEKC010")?.hint;
        expect(hint).toBe(
          "define it in slides/intro.css, or use one of: slide-title; to find an element from slides/intro.ts, use a data-* attribute instead",
        );
      },
    );
  });

  test("DEKC011 points style attributes at the slide stylesheet", async () => {
    const diagnostics = await lintIntro(`<section class="slide" data-layout="title">
  <h2 class="slide-title" style="color: red">intro</h2>
</section>`);
    const hint = diagnostics.find((d) => d.id === "DEKC011")?.hint;
    expect(hint).toBe("move it to a class in slides/intro.css, using token var()");
  });

  test("DEKC011 points scripts at the slide script", async () => {
    const diagnostics = await lintIntro(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <script>1</script>
</section>`);
    const hint = diagnostics.find((d) => d.id === "DEKC011")?.hint;
    expect(hint).toBe("move motion to slides/intro.ts as a draw(t) function");
  });

  test("DEKC020 names the asset path to download into", async () => {
    const diagnostics = await lintIntro(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <img src="https://cdn.example.com/img/logo.png?v=2" alt="">
</section>`);
    const hint = diagnostics.find((d) => d.id === "DEKC020")?.hint;
    expect(hint).toBe("download it into assets/ and use assets/logo.png");
  });
});

describe("lintDeck locations and data", () => {
  const script = `---
title: Demo
---

## intro

hello

### hook

body
`;

  async function lintSlide(html: string, css?: string) {
    return withTempProject(
      {
        decks: [
          {
            name: "demo",
            script,
            slides: { intro: html },
            ...(css === undefined ? {} : { styles: { intro: css } }),
            theme: `.slide { --fg: #fff; }\n.slide .slide-title { color: var(--fg); }\n`,
          },
        ],
      },
      async (root) => lintDeck(join(root, "decks", "demo")),
    );
  }

  test("points HTML diagnostics at the line that has the problem", async () => {
    const diagnostics = await lintSlide(`<section class="slide">
  <h2 class="slide-title">intro</h2>
  <p data-step="hok">x</p>
  <p class="slide-title headline">y</p>
  <p style="color: red">z</p>
  <img src="https://example.com/a.png" alt="">
  <img src="assets/missing.png" alt="">
</section>
`);
    const lineOf = (id: string) => diagnostics.find((d) => d.id === id)?.line;
    expect(lineOf("DEKC003")).toBe(3);
    expect(lineOf("DEKC010")).toBe(4);
    expect(lineOf("DEKC011")).toBe(5);
    expect(lineOf("DEKC020")).toBe(6);
    expect(lineOf("DEKC021")).toBe(7);
  });

  test("carries the offending value as data", async () => {
    const diagnostics = await lintSlide(
      `<section class="slide">
  <p data-step="hok" class="headline">x</p>
  <img src="https://example.com/a.png" alt="">
  <img src="assets/missing.png" alt="">
</section>
`,
      ".headline { font-size: 96px; }\n",
    );
    const dataOf = (id: string) => diagnostics.find((d) => d.id === id)?.data;
    expect(dataOf("DEKC003")).toEqual({ step: "hok", choices: ["hook", "1"] });
    expect(dataOf("DEKC014")).toEqual({ property: "font-size", value: "96px" });
    expect(dataOf("DEKC020")).toEqual({ url: "https://example.com/a.png" });
    expect(dataOf("DEKC021")).toEqual({ src: "assets/missing.png" });
  });

  test("names the unknown class as data", async () => {
    const diagnostics = await lintSlide(`<section class="slide">
  <p class="headline">x</p>
</section>
`);
    expect(diagnostics.find((d) => d.id === "DEKC010")?.data).toEqual({ class: "headline" });
  });

  test("names the missing word as data", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: "---\ntitle: Demo\n---\n\n## intro\n\nこんにちは、AI です。\n",
            slides: { intro: titleSlide },
          },
        ],
      },
      async (root) => {
        const dir = join(root, "decks", "demo", "voice");
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, "voice.toml"), `engine = "voicevox"\nspeaker = "a"\n`);
        const dekc040 = lintDeck(join(root, "decks", "demo")).find((d) => d.id === "DEKC040");
        expect(dekc040?.data).toEqual({ word: "AI" });
      },
    );
  });
});

describe("DEKC014 hints", () => {
  const theme = `.slide {
  --fg: #f5f5f5;
  --accent: rgb(255 0 102);
  --font-body: "Inter", sans-serif;
  --size-body: 1.5rem;
  --size-stat: 6rem;
  --gap: 2rem;
  --radius: 4px;
  --step-transition: 0.3s ease;
}
`;

  async function hintFor(css: string): Promise<string | undefined> {
    return withTempProject(
      { decks: [{ name: "demo", slides: { intro: titleSlide }, styles: { intro: css }, theme }] },
      async (root) =>
        lintDeck(join(root, "decks", "demo")).find(
          (d) => d.id === "DEKC014" && d.path?.endsWith(".css") && !d.path.endsWith("theme.css"),
        )?.hint,
    );
  }

  const local = (value: string) => `name it in this file: .slide { --<name>: ${value}; }`;

  test("offers the theme's color tokens for a raw color, or a name of the slide's own", async () => {
    expect(await hintFor(".x { color: #ff0066; }\n")).toBe(
      `use var(--accent) or var(--fg); or ${local("#ff0066")}`,
    );
  });

  test("offers the size tokens for a raw font-size", async () => {
    expect(await hintFor(".x { font-size: 96px; }\n")).toBe(
      `use var(--size-body) or var(--size-stat); or ${local("96px")}`,
    );
  });

  test("offers length tokens for raw spacing and radius", async () => {
    expect(await hintFor(".x { margin: 12px; }\n")).toBe(`use var(--gap); or ${local("12px")}`);
    expect(await hintFor(".x { border-radius: 8px; }\n")).toBe(
      `use var(--radius); or ${local("8px")}`,
    );
  });

  test("offers the font tokens for a raw font-family", async () => {
    expect(await hintFor('.x { font-family: "Noto Sans"; }\n')).toBe(
      `use var(--font-body); or ${local('"Noto Sans"')}`,
    );
  });

  test("names the value on the slide when no theme token fits", async () => {
    expect(await hintFor(".x { transition: opacity 200ms; }\n")).toBe(
      `use var(--step-transition); or ${local("opacity 200ms")}`,
    );
    expect(await hintFor(".x { width: 100px; }\n")).toBe(
      `${local("100px")}, then use var(--<name>)`,
    );
  });

  test("offers a slide stylesheet's own tokens only when it sets them on .slide", async () => {
    expect(await hintFor(".slide { --own: 12px; }\n.x { margin: 12px; }\n")).toBe(
      `use var(--gap) or var(--own); or ${local("12px")}`,
    );
  });

  test("sends a raw custom property set off .slide to the .slide rule", async () => {
    expect(await hintFor(".slide .bar { --bar-h: 12px; }\n")).toBe(
      "set --bar-h on this file's .slide rule, where the slide's own tokens go, and use var(--bar-h) below it",
    );
  });

  // A slide's token, set on .slide and changed for one part of it, as a seal is drawn larger in
  // one card: moving the value to .slide would lose the change, so it gets a name of its own.
  test("names a part's own value on .slide when it changes a token the slide sets", async () => {
    const css = ".slide { --seal-box: 76px; }\n.chance { --seal-box: 120px; }\n";
    expect(await hintFor(css)).toBe(
      "name the value on this file's .slide rule, as --seal-box-chance: 120px, and set --seal-box: var(--seal-box-chance) here, so .chance still changes --seal-box for what it holds",
    );
  });

  test("names a part's own value too when it changes a token the theme sets", async () => {
    expect(await hintFor(".triple { --gap: 12px; }\n")).toBe(
      "name the value on this file's .slide rule, as --gap-triple: 12px, and set --gap: var(--gap-triple) here, so .triple still changes --gap for what it holds",
    );
  });

  test("takes the hint's way out: the part changes the token through a name on .slide", async () => {
    const fixed =
      ".slide { --seal-box: 76px; --seal-box-chance: 120px; }\n.chance { --seal-box: var(--seal-box-chance); }\n";
    expect(await hintFor(fixed)).toBeUndefined();
  });

  test.each([
    [".slide .card > .title", "title"],
    ["#hero", "hero"],
    [".slide li", "li"],
  ])("names the value after the last part of %p", async (selector, name) => {
    const css = `.slide { --pad: 8px; }\n${selector} { --pad: 12px; }\n`;
    expect(await hintFor(css)).toContain(`as --pad-${name}: 12px`);
  });

  test("offers an easing token for a raw easing, not a duration", async () => {
    expect(await hintFor(".x { transition: opacity var(--step-transition) steps(4); }\n")).toBe(
      `${local("opacity var(--step-transition) steps(4)")}, then use var(--<name>)`,
    );
  });

  test("points theme.css at a token of its own when none fits", async () => {
    const hint = await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: { intro: titleSlide },
            theme: `${theme}.slide .x { width: 100px; margin: 12px; }\n`,
          },
        ],
      },
      async (root) =>
        lintDeck(join(root, "decks", "demo"))
          .filter((d) => d.id === "DEKC014")
          .map((d) => d.hint),
    );
    expect(hint).toEqual(["add a token for it to .slide and use var() here", "use var(--gap)"]);
  });

  test("offers theme.css only the tokens every slide gets, as a slide stylesheet sees them", async () => {
    const hint = await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: { intro: titleSlide },
            // --wide-gap is set only on one layout: a rule elsewhere cannot count on it.
            theme: `${theme}.slide[data-layout="wide"] { --wide-gap: 3rem; }\n.slide .x { margin: 12px; }\n`,
          },
        ],
      },
      async (root) =>
        lintDeck(join(root, "decks", "demo"))
          .filter((d) => d.id === "DEKC014")
          .map((d) => d.hint),
    );
    expect(hint).toEqual(["use var(--gap)"]);
  });
});

describe("asset references resolve the same way lint, show, and build resolve them", () => {
  test("a query string on an existing asset is not a missing image", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: {
              intro: slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <img src="assets/pixel.png?v=2" alt="">
</section>`),
            },
            assets: { "pixel.png": "png" },
          },
        ],
      },
      async (root) => {
        const ids = lintDeck(join(root, "decks", "demo")).map((d) => d.id);
        expect(ids).not.toContain("DEKC021");
        expect(ids).not.toContain("DEKC023");
      },
    );
  });

  test("a remote url() in a slide stylesheet gets the same hint as a remote src", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: { intro: titleSlide },
            styles: { intro: '.slide .x { background: url("https://cdn.example.com/bg.png"); }\n' },
          },
        ],
      },
      async (root) => {
        const remote = lintDeck(join(root, "decks", "demo")).filter((d) => d.id === "DEKC020");
        expect(remote).toHaveLength(1);
        expect(remote[0]?.hint).toBe("download it into assets/ and use assets/bg.png");
      },
    );
  });
});

describe("every diagnostic that names a value carries it in data", () => {
  test("structure, theme, and script rules expose what their messages say", async () => {
    await withTempProject(
      {
        toml: "max_classes = 1\n",
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## intro

hello

## intro

again

## other

more
`,
            slides: {
              intro: slideDocument(
                `<section class="slide" data-slug="wrong"><h2 class="slide-title">i</h2></section>`,
              ),
              other: titleSlide,
              orphan: titleSlide,
            },
            theme: `h1 { color: red; }\n.slide { color: red; }\n.slide .a {}\n.slide .b {}\n`,
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await writeFile(join(deckDir, "slides", "other.js"), "export function draw() {}\n");
        const diagnostics = lintDeck(deckDir);
        const dataOf = (id: string) => diagnostics.find((d) => d.id === id)?.data;
        expect(dataOf("DEKC004")).toEqual({ id: "intro" });
        expect(dataOf("DEKC002")).toEqual({ slug: "orphan", file: "slides/orphan.html" });
        expect(dataOf("DEKC006")).toEqual({ slug: "wrong", expected: "intro" });
        expect(dataOf("DEKC012")).toEqual({ selector: "h1" });
        expect(dataOf("DEKC013")).toEqual({ classes: 3, limit: 1 });
        expect(dataOf("DEKC015")).toMatchObject({ token: expect.stringMatching(/^--/) });
        expect(dataOf("DEKC016")).toEqual({ file: "slides/other.js" });
      },
    );
  });
});

describe("markup rules report every occurrence where it is written", () => {
  async function lintMarkup(
    html: string,
    options: { script?: string; assets?: Record<string, string> } = {},
  ) {
    return withTempProject(
      {
        decks: [
          {
            name: "demo",
            ...(options.script === undefined ? {} : { script: options.script }),
            ...(options.assets === undefined ? {} : { assets: options.assets }),
            slides: { intro: html },
          },
        ],
      },
      async (root) => lintDeck(join(root, "decks", "demo")),
    );
  }
  const only = (diagnostics: ReturnType<typeof lintDeck>, id: string) =>
    diagnostics
      .filter((d) => d.id === id)
      .map(({ line, column, data }) => ({ line, column, data }));

  test("DEKC011: every inline style and script, event handler, and javascript: URL", async () => {
    const diagnostics = await lintMarkup(`<section class="slide" data-layout="title">
  <h2 class="slide-title" style="color: red">intro</h2>
  <p style="margin: 0">a</p>
  <style>.a {}</style><style>.b {}</style>
  <script>1</script>
  <button onclick="go()" onmouseover="x()">b</button>
  <a href="javascript:void(0)">c</a>
</section>
`);
    expect(only(diagnostics, "DEKC011")).toEqual([
      { line: 2, column: 27, data: { kind: "attribute", name: "style", value: "color: red" } },
      { line: 3, column: 6, data: { kind: "attribute", name: "style", value: "margin: 0" } },
      { line: 4, column: 3, data: { kind: "element", name: "style" } },
      { line: 4, column: 23, data: { kind: "element", name: "style" } },
      { line: 5, column: 3, data: { kind: "element", name: "script" } },
      { line: 6, column: 11, data: { kind: "attribute", name: "onclick", value: "go()" } },
      { line: 6, column: 26, data: { kind: "attribute", name: "onmouseover", value: "x()" } },
      {
        line: 7,
        column: 6,
        data: { kind: "attribute", name: "href", value: "javascript:void(0)" },
      },
    ]);
    const handler = diagnostics.find((d) => d.data?.name === "onclick");
    expect(handler?.message).toBe("slide contains an onclick attribute");
    expect(handler?.hint).toBe(
      "remove it; a slide takes no input, and motion goes in slides/intro.ts as a draw(t) function",
    );
  });

  test("DEKC020: a remote URL in srcset, poster, or a media source", async () => {
    const diagnostics = await lintMarkup(
      `<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <img src="assets/a.png" srcset="assets/a.png 1x, https://cdn.example.com/a@2x.png 2x" alt="">
  <video poster="https://cdn.example.com/p.png"><source src="https://cdn.example.com/v.mp4"></video>
</section>
`,
      { assets: { "a.png": "png" } },
    );
    expect(only(diagnostics, "DEKC020")).toEqual([
      { line: 3, column: 52, data: { url: "https://cdn.example.com/a@2x.png" } },
      { line: 4, column: 18, data: { url: "https://cdn.example.com/p.png" } },
      { line: 4, column: 62, data: { url: "https://cdn.example.com/v.mp4" } },
    ]);
  });

  test("DEKC021: a missing file for any element that loads one, not only <img>", async () => {
    const diagnostics = await lintMarkup(
      `<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <img src="assets/a.png" srcset="assets/a@2x.png 2x" alt="">
  <video src="assets/v.mp4" poster="assets/p.png"><track src="assets/v.vtt"></video>
  <audio><source src="assets/a.mp3"></audio>
  <iframe src="assets/demo.html"></iframe>
  <a href="assets/notes.pdf">notes</a>
</section>
`,
      { assets: { "a.png": "png" } },
    );
    expect(only(diagnostics, "DEKC021").map((d) => d.data?.src)).toEqual([
      "assets/a@2x.png",
      "assets/v.mp4",
      "assets/p.png",
      "assets/v.vtt",
      "assets/a.mp3",
      "assets/demo.html",
    ]);
    const messages = diagnostics.filter((d) => d.id === "DEKC021").map((d) => d.message);
    expect(messages[0]).toBe('missing image "assets/a@2x.png"');
    expect(messages[1]).toBe('missing file "assets/v.mp4"');
  });

  test("DEKC023: a srcset candidate outside assets/ is flagged like a src", async () => {
    const diagnostics = await lintMarkup(
      `<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <img src="assets/a.png" srcset="../assets/a.png 2x" alt="">
</section>
`,
      { assets: { "a.png": "png" } },
    );
    expect(only(diagnostics, "DEKC023")).toEqual([
      { line: 3, column: 35, data: { src: "../assets/a.png" } },
    ]);
  });

  test("every data-step that resolves to nothing is reported at its own line", async () => {
    const diagnostics = await lintMarkup(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <p data-step="nope">a</p>
  <p data-step="nope">b</p>
</section>
`);
    expect(only(diagnostics, "DEKC003").map((d) => d.line)).toEqual([3, 4]);
  });
});

describe("DEKC029: text hidden from lint by aria-hidden", () => {
  const script = "---\ntitle: Demo\n---\n\n## intro\n\nhello\n";

  async function lintIntro(intro: string) {
    return withTempProject({ decks: [{ name: "demo", script, slides: { intro } }] }, async (root) =>
      lintDeck(join(root, "decks", "demo")),
    );
  }

  test("warns of a labeled figure marked as decoration, and says how to let lint see it", async () => {
    const found = (
      await lintIntro(`<section class="slide">
  <h2 class="slide-title">intro</h2>
  <svg viewBox="0 0 10 10" aria-hidden="true"><text x="1" y="5">試した技術</text><text x="1" y="9">還ってくるまでの長い寄り道を本線に戻す</text></svg>
</section>
`)
    ).filter((d) => d.id === "DEKC029");
    expect(found).toEqual([
      {
        id: "DEKC029",
        severity: "warning",
        message:
          '<svg aria-hidden="true"> holds text the audience reads, "試した技術 還ってくるまでの長い寄り道を本線に戻…", which lint does not measure',
        path: expect.stringContaining("slides/intro.html"),
        line: 3,
        column: 3,
        slug: "intro",
        hint: 'if the audience should read it, remove aria-hidden="true" from it so lint measures its contrast and overflow; an SVG can take role="img" and an aria-label instead. Keep aria-hidden only on decoration, or on a sample the talk shows as unreadable',
        data: { tag: "svg", text: "試した技術 還ってくるまでの長い寄り道を本線に戻す" },
      },
    ]);
  });

  test("leaves decoration with nothing to read alone", async () => {
    const found = (
      await lintIntro(`<section class="slide">
  <h2 class="slide-title">intro</h2>
  <div aria-hidden="true"><span></span><span></span></div>
</section>
`)
    ).filter((d) => d.id === "DEKC029");
    expect(found).toEqual([]);
  });
});

describe("DEKC024: a heading with nothing to read", () => {
  const script = `---
title: Demo
---

## intro

hello

## architecture

how it fits
`;

  async function lintTwo(slides: Record<string, string>) {
    return withTempProject({ decks: [{ name: "demo", script, slides }] }, async (root) =>
      lintDeck(join(root, "decks", "demo")),
    );
  }

  test("an id-only heading's skeleton says to title it in script.md, and sync fixes it", async () => {
    const skeleton = `<section class="slide" data-layout="title">
  <h2 class="slide-title"></h2>
</section>
`;
    const diagnostics = await lintTwo({ intro: titleSlide, architecture: skeleton });
    const found = diagnostics.filter((d) => d.id === "DEKC024");
    expect(found).toEqual([
      {
        id: "DEKC024",
        severity: "warning",
        message: "<h2> is empty, so the slide shows no heading",
        path: expect.stringContaining("slides/architecture.html"),
        line: 2,
        column: 3,
        slug: "architecture",
        hint: "give the slide a title in script.md, like `## Your title {#architecture}`, then run `dekc sync`; for a slide with no title, such as a quote, remove the element from slides/architecture.html",
        data: { tag: "h2" },
      },
    ]);
  });

  test("a slide meant to have no title keeps none once the element is gone", async () => {
    // `## architecture` on purpose: a quote slide, say. Taking the hint's second way out.
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script,
            slides: {
              intro: titleSlide,
              architecture: `<section class="slide" data-layout="title">
  <h2 class="slide-title"></h2>
</section>
`,
            },
          },
        ],
      },
      async (root) => {
        const deck = join(root, "decks", "demo");
        const file = join(deck, "slides", "architecture.html");
        await writeFile(file, `<section class="slide" data-layout="title">\n</section>\n`);
        syncDeck(deck);
        expect(await readFile(file, "utf8")).not.toContain("<h2");
        expect(lintDeck(deck)).toEqual([]);
      },
    );
  });

  test("an edited slide is told to fill the heading in or drop it", async () => {
    const edited = `<section class="slide" data-layout="title">
  <h2 class="slide-title"></h2>
  <p>body</p>
</section>
`;
    const found = (await lintTwo({ intro: titleSlide, architecture: edited })).find(
      (d) => d.id === "DEKC024",
    );
    expect(found?.hint).toBe(
      "write the heading's text in slides/architecture.html, or remove the element",
    );
  });

  test("the first id-only heading takes the deck title, so it passes", async () => {
    const withTitle = `<section class="slide" data-layout="title">
  <h2 class="slide-title">architecture</h2>
</section>
`;
    const diagnostics = await lintTwo({ intro: titleSlide, architecture: withTitle });
    expect(diagnostics.filter((d) => d.id === "DEKC024")).toEqual([]);
  });
});

describe("rule scopes", () => {
  // One of nearly every kind of finding: a slide finding names its slide, a deck finding none.
  const script = `---
title: Demo
duration: 60m
venu: Tokyo
---

# Part one

## intro

hello dekc

### a {#a}

- item

### b {#a}

#### aside

## missing

text
`;
  const intro = slideDocument(`<section class="slide">
  <h2 class="slide-title">intro</h2>
  <p class="nope" style="color: red" data-step="zz">x</p>
  <img src="https://example.com/a.png" alt="">
</section>`);

  test("each finding falls in a scope its rule declares", async () => {
    await withTempProject(
      {
        toml: "bogus = 1\n",
        decks: [
          {
            name: "demo",
            script,
            slides: { intro, gone: intro },
            styles: { intro: "body { color: #fff; }\n" },
            scripts: { intro: "export default { draw() { setTimeout(() => {}, 1); } };\n" },
            theme: "html { color: red; }\n.slide { --fg: #fff; }\n.slide p { color: #000; }\n",
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await writeFile(join(deckDir, "slides", "old.js"), "export default {};\n");
        await mkdir(join(deckDir, "voice"), { recursive: true });
        await writeFile(
          join(deckDir, "voice", "voice.toml"),
          'engine = "voicevox"\nspeaker = "a"\n\n[beats."nope"]\npause = 1\n',
        );
        const resolved = resolveDeck(deckDir);
        const found = [
          ...lintProject(resolved.project).map((d) => ({ d, scope: "project" })),
          ...lintDeck(resolved).map((d) => ({ d, scope: d.slug === undefined ? "deck" : "slide" })),
        ];
        const outOfScope = found
          .filter(
            ({ d, scope }) => !(RULES[d.id as RuleId].scopes as readonly string[]).includes(scope),
          )
          .map(({ d, scope }) => `${d.id} as ${scope}: ${d.message}`);
        expect(outOfScope).toEqual([]);
        const seen = new Set(found.map(({ d, scope }) => `${d.id} ${scope}`));
        for (const expected of [
          "DEKC008 project",
          "DEKC008 deck",
          "DEKC012 deck",
          "DEKC012 slide",
          "DEKC014 deck",
          "DEKC014 slide",
          "DEKC044 deck",
          "DEKC044 slide",
          "DEKC041 deck",
          "DEKC043 deck",
          "DEKC001 slide",
          "DEKC002 slide",
          "DEKC016 slide",
          "DEKC017 slide",
        ]) {
          expect(seen).toContain(expected);
        }
      },
    );
  });
});
