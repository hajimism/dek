import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { lintDeck, lintProject } from "../../src/core/lint.ts";
import { resolveDeck } from "../../src/core/resolve.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const slide = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

const tokens = `.slide {
  --fg: #111; --bg: #fff; --accent: #06c; --muted: #666;
  --font-title: sans-serif; --font-body: sans-serif;
  --size-title: 64px; --size-body: 32px; --size-caption: 20px;
  --gap: 16px; --pad: 32px; --radius: 8px; --step-transition: 0.3s;
}
.slide .slide-title { color: var(--fg); }
.slide[data-layout="title"] { color: var(--fg); }
`;

async function lintWith(options: { theme?: string; css?: string; toml?: string }) {
  return withTempProject(
    {
      ...(options.toml === undefined ? {} : { toml: options.toml }),
      decks: [
        {
          name: "demo",
          slides: { intro: slide },
          theme: `${tokens}${options.theme ?? ""}`,
          ...(options.css === undefined ? {} : { styles: { intro: options.css } }),
        },
      ],
    },
    async (root) => {
      const resolved = resolveDeck(join(root, "decks", "demo"));
      return [...lintProject(resolved.project), ...lintDeck(resolved)];
    },
  );
}

const ids = (diagnostics: Array<{ id: string }>) => diagnostics.map((d) => d.id);

describe("theme.css is read as CSS reads it", () => {
  test("DEK012 keeps a selector list inside :is() whole, and knows + and ~", async () => {
    const found = await lintWith({
      theme:
        ".slide :is(.slide-title, h2) { color: var(--fg); }\n.slide+.slide-title { color: var(--fg); }\n",
    });
    expect(ids(found)).not.toContain("DEK012");
  });

  test("DEK012 sees a page rule inside @media", async () => {
    const found = await lintWith({ theme: "@media print { body { color: var(--fg); } }\n" });
    expect(found.filter((d) => d.id === "DEK012").map((d) => d.data)).toEqual([
      { selector: "body" },
    ]);
  });

  test("DEK012 names the line and how to scope the rule", async () => {
    const found = await lintWith({
      theme: "h1 { color: var(--fg); }\nbody { color: var(--fg); }\n",
    });
    expect(
      found.filter((d) => d.id === "DEK012").map(({ line, hint }) => ({ line, hint })),
    ).toEqual([
      { line: 9, hint: "write it as .slide h1" },
      {
        line: 10,
        hint: "theme.css styles slides, not the page: put it on .slide, whose content inherits it",
      },
    ]);
  });

  test("DEK012 leaves a rule nested under .slide alone", async () => {
    const found = await lintWith({ theme: ".slide { .slide-title { color: var(--fg); } }\n" });
    expect(ids(found)).not.toContain("DEK012");
  });

  test("DEK014 sees a raw value in a nested rule, and not one written in a string", async () => {
    const found = await lintWith({
      theme:
        '.slide { &:hover { color: #f00; } .slide-title::after { content: "#fff red 10px"; } }\n',
    });
    expect(found.filter((d) => d.id === "DEK014").map((d) => d.data)).toEqual([
      { property: "color", value: "#f00" },
    ]);
  });

  test("DEK010 knows a class defined only in a nested rule", async () => {
    const found = await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: {
              intro: slideDocument(`<section class="slide"><p class="hero">x</p></section>`),
            },
            theme: `${tokens}.slide { .hero { color: var(--fg); } }\n`,
          },
        ],
      },
      async (root) => lintDeck(join(root, "decks", "demo")),
    );
    expect(ids(found)).not.toContain("DEK010");
  });
});

describe("slide stylesheets are read as CSS reads them", () => {
  // A slide's CSS is scoped to its own slide, so a rule that reaches the slides after it, or an
  // at-rule that registers something for the whole page, escapes the scope and changes others.
  test("DEK012 refuses what reaches past the slide, with its line and where it belongs", async () => {
    const found = await lintWith({
      css: `.slide ~ .slide .slide-title { color: var(--fg); }
@property --spin { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
@counter-style dots { system: cyclic; symbols: "*"; }
@page { margin: 0; }
.slide + .slide { color: var(--fg); }
.card ~ .card { color: var(--fg); }
`,
    });
    expect(
      found
        .filter((d) => d.id === "DEK012")
        .map(({ message, line, hint }) => ({ message, line, hint })),
    ).toEqual([
      {
        message: '".slide ~ .slide .slide-title" reaches the slides after this one',
        line: 1,
        hint: "start the selector at .slide and stay inside it; a rule for more than one slide belongs in theme.css",
      },
      {
        message: "@property applies to the whole deck",
        line: 2,
        hint: "move it to theme.css",
      },
      {
        message: "@counter-style applies to the whole deck",
        line: 3,
        hint: "move it to theme.css",
      },
      { message: "@page applies to the whole deck", line: 4, hint: "move it to theme.css" },
      {
        message: '".slide + .slide" reaches the slides after this one',
        line: 5,
        hint: "start the selector at .slide and stay inside it; a rule for more than one slide belongs in theme.css",
      },
    ]);
  });

  // The theme is part of the deck like any slide: what it loads must be in the deck, or the build
  // ships a link to the outside and the talk depends on a network at the venue.
  test("DEK020 to DEK023 check the theme's url()s and @imports as they check a slide's", async () => {
    const found = await lintWith({
      theme: `.slide .lede { background-image: url(https://example.com/x.png); }
@font-face { font-family: X; src: url("assets/missing.woff2"); }
.slide .rule { background: url(../../outside.png); }
@import "https://fonts.example.com/css?family=X";
`,
    });
    expect(
      found
        .filter((d) => ["DEK020", "DEK021", "DEK022"].includes(d.id))
        .map((d) => ({ id: d.id, path: d.path?.split("/").pop(), line: d.line, slug: d.slug })),
    ).toEqual([
      { id: "DEK020", path: "theme.css", line: 9, slug: undefined },
      { id: "DEK021", path: "theme.css", line: 10, slug: undefined },
      { id: "DEK022", path: "theme.css", line: 11, slug: undefined },
      { id: "DEK020", path: "theme.css", line: 12, slug: undefined },
    ]);
  });

  test("DEK021 checks a url() in a nested rule", async () => {
    const found = await lintWith({
      css: ".slide { .hero { background: url(assets/gone.png); } }\n",
    });
    expect(found.filter((d) => d.id === "DEK021").map((d) => d.data)).toEqual([
      { src: "assets/gone.png" },
    ]);
  });
});

describe("DEK008 in dek.toml", () => {
  test("catches a misspelled key inside an inline table, on its line", async () => {
    const found = await lintWith({ toml: '# project\nvoice = { speaker = "a", sped = 1.2 }\n' });
    expect(found.filter((d) => d.id === "DEK008")).toMatchObject([
      { line: 2, data: { key: "voice.sped", suggestion: "voice.speed" } },
    ]);
  });

  test("names an unknown table once, not each key in it", async () => {
    const found = await lintWith({ toml: '[voyce]\nspeaker = "a"\nspeed = 1\n' });
    expect(found.filter((d) => d.id === "DEK008")).toMatchObject([
      { line: 1, data: { key: "voyce", suggestion: "voice" } },
    ]);
  });

  test("takes any key under [refs]", async () => {
    const found = await lintWith({ toml: `[refs]\n"o/r/d" = "${"a".repeat(40)}"\n` });
    expect(ids(found)).not.toContain("DEK008");
  });
});
