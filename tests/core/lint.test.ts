import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DekError, lintDeck, resolveDeck } from "../../src/core/index.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

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
        expect(() => lintDeck(resolved.deck.dir)).toThrow(DekError);
        expect(lintDeck(resolved)).toEqual([]);
      },
    );
  });

  test("DEK006: data-slug does not match the section id", async () => {
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
        expect(diagnostics.some((d) => d.id === "DEK006")).toBe(true);
        const dek006 = diagnostics.find((d) => d.id === "DEK006");
        expect(dek006?.path).toContain("slides/intro.html");
        expect(dek006?.message).toContain("other");
        expect(dek006?.slug).toBe("intro");
      },
    );
  });

  test("DEK001: script.md has a section with no HTML", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const diagnostics = lintDeck(join(root, "decks", "demo"));
      expect(diagnostics.some((d) => d.id === "DEK001")).toBe(true);
      const dek001 = diagnostics.find((d) => d.id === "DEK001");
      expect(dek001?.path).toContain("slides/intro.html");
    });
  });

  test("DEK002: slides/ has HTML with no section", async () => {
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
        expect(diagnostics.some((d) => d.id === "DEK002")).toBe(true);
        const dek002 = diagnostics.find((d) => d.id === "DEK002");
        expect(dek002?.path).toContain("slides/leftover.html");
      },
    );
  });

  test("DEK003: data-step is neither a beat id nor a positive integer", async () => {
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
        expect(diagnostics.some((d) => d.id === "DEK003")).toBe(true);
      },
    );
  });

  test("DEK004: duplicate section slugs in a deck", async () => {
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
        expect(diagnostics.some((d) => d.id === "DEK004")).toBe(true);
      },
    );
  });

  test("DEK004: duplicate beat ids in a section", async () => {
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
        expect(diagnostics.some((d) => d.id === "DEK004")).toBe(true);
      },
    );
  });

  test("DEK005: duplicate data-morph names in one slide", async () => {
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
        expect(diagnostics.some((d) => d.id === "DEK005")).toBe(true);
      },
    );
  });

  const vocabTheme = `.slide {}
.slide .slide-title {}
.slide .node {}
.slide[data-layout="title"] {}
`;

  test("DEK010: class not defined in the deck theme", async () => {
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
        expect(diagnostics.some((d) => d.id === "DEK010")).toBe(true);
      },
    );
  });

  test("DEK011: inline style element in a slide", async () => {
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
        expect(diagnostics.some((d) => d.id === "DEK011")).toBe(true);
      },
    );
  });

  test("DEK011: style attribute on a slide element", async () => {
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
        expect(diagnostics.some((d) => d.id === "DEK011")).toBe(true);
      },
    );
  });

  test("DEK011: script element in a slide", async () => {
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
        expect(diagnostics.some((d) => d.id === "DEK011")).toBe(true);
      },
    );
  });

  test("DEK012: top-level selector in theme.css", async () => {
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
        expect(diagnostics.some((d) => d.id === "DEK012")).toBe(true);
      },
    );
  });

  test("DEK012: allows .slide, view-transition, and at-rules", async () => {
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
        expect(diagnostics.some((d) => d.id === "DEK012")).toBe(false);
      },
    );
  });

  test("DEK010/DEK012 stay quiet when theme.css has a brace inside content", async () => {
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
            (d) => d.id === "DEK010" || d.id === "DEK012",
          ),
        ).toEqual([]);
      },
    );
  });

  test("DEK013: theme class count exceeds the default of 40", async () => {
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
        expect(diagnostics.some((d) => d.id === "DEK013")).toBe(true);
      },
    );
  });

  test("DEK013: max_classes in dek.toml raises the limit", async () => {
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
        expect(diagnostics.some((d) => d.id === "DEK013")).toBe(false);
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

  test("DEK015: missing required token on .slide", async () => {
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
        const dek015 = diagnostics.filter((d) => d.id === "DEK015");
        expect(dek015).toHaveLength(1);
        expect(dek015[0]?.message).toContain("--accent");
        expect(dek015[0]?.path).toContain("theme.css");
      },
    );
  });

  test("DEK015: does not fire when the contract is published", async () => {
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
        expect(diagnostics.some((d) => d.id === "DEK015")).toBe(false);
      },
    );
  });

  test("DEK015: extra custom properties are allowed", async () => {
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
        expect(diagnostics.some((d) => d.id === "DEK015")).toBe(false);
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

  test("DEK014: raw color outside a custom property", async () => {
    const ids = await lintThemeCss(".slide { color: #f00; }\n");
    expect(ids).toContain("DEK014");
  });

  test("DEK014: raw px outside a custom property", async () => {
    const ids = await lintThemeCss(".slide { padding: 16px; }\n");
    expect(ids).toContain("DEK014");
  });

  test("DEK014: raw font-family outside a custom property", async () => {
    const ids = await lintThemeCss(".slide { font-family: sans-serif; }\n");
    expect(ids).toContain("DEK014");
  });

  test("DEK014: var() fallback", async () => {
    const ids = await lintThemeCss(".slide { color: var(--fg, #fff); }\n");
    expect(ids).toContain("DEK014");
  });

  test("DEK014: allows token assignment, var, calc, 0, thin, and em", async () => {
    const ids = await lintThemeCss(`
.slide {
  color: var(--fg);
  padding: calc(var(--gap) * 0.75);
  margin: 0;
  border: thin solid var(--muted);
  transform: translateY(0.5em);
}
`);
    expect(ids).not.toContain("DEK014");
    expect(ids).not.toContain("DEK015");
  });

  test("DEK020: remote URL reference", async () => {
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
        expect(diagnostics.some((d) => d.id === "DEK020")).toBe(true);
      },
    );
  });

  test("DEK021: missing local image", async () => {
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
        expect(diagnostics.some((d) => d.id === "DEK021")).toBe(true);
      },
    );
  });

  test("DEK022: path escapes the deck directory", async () => {
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
        expect(diagnostics.some((d) => d.id === "DEK022")).toBe(true);
      },
    );
  });

  test("DEK022: allows ../theme.css and deck-local assets", async () => {
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
        expect(diagnostics.some((d) => d.id === "DEK022")).toBe(false);
        expect(diagnostics.some((d) => d.id === "DEK021")).toBe(false);
      },
    );
  });

  test("DEK023: src that reaches assets through ../ is flagged", async () => {
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
        const diagnostics = lintDeck(deckDir).filter((d) => d.id === "DEK023");
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          path: join(deckDir, "slides", "intro.html"),
          slug: "intro",
        });
        expect(diagnostics[0]?.message).toContain("assets/pixel.png");
      },
    );
  });

  test("DEK023: deck-relative assets/ src, data:, #, and link href are not flagged", async () => {
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
        expect(lintDeck(join(root, "decks", "demo")).filter((d) => d.id === "DEK023")).toEqual([]);
      },
    );
  });

  test("DEK023: does not double-report with DEK020 or DEK022", async () => {
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
        expect(ids).toContain("DEK020");
        expect(ids).toContain("DEK022");
        expect(ids).not.toContain("DEK023");
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
        expect(diagnostics.filter((d) => d.id === "DEK010")).toEqual([]);
      },
    );
  });

  test("suggests dek mv when one DEK001 and one DEK002", async () => {
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
        expect(diagnostics.some((d) => d.id === "DEK001")).toBe(true);
        expect(diagnostics.some((d) => d.id === "DEK002")).toBe(true);
        expect(diagnostics.some((d) => d.message.includes("dek mv leftover intro"))).toBe(true);
      },
    );
  });

  test("DEK043: flags a voice.toml beat key that matches no slide or beat", async () => {
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
        const found = lintDeck(join(root, "decks", "demo")).filter((d) => d.id === "DEK043");
        expect(found).toHaveLength(1);
        expect(found[0]?.message).toContain("intro/gone");
      },
    );
  });

  test("DEK040: flags English words missing from the deck dictionary when voice/ exists", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## intro

hello dek
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
        expect(diagnostics.some((d) => d.id === "DEK040" && d.message.includes("dek"))).toBe(true);
      },
    );
  });

  test("DEK042: flags a beat with visible body but no spoken paragraph when voice/ exists", async () => {
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
        expect(lintDeck(join(root, "decks", "demo")).some((d) => d.id === "DEK042")).toBe(false);
        const dir = join(root, "decks", "demo", "voice");
        await mkdir(dir, { recursive: true });
        await writeFile(
          join(dir, "voice.toml"),
          `engine = "voicevox"\nspeaker = "ずんだもん/ノーマル"\n`,
        );
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        const dek042 = diagnostics.find((d) => d.id === "DEK042");
        expect(dek042).toBeDefined();
        expect(dek042?.message).toContain('"intro"');
        expect(dek042?.message).toContain("beat 2");
        expect(dek042?.message).toContain("not synthesized");
        expect(dek042?.path).toContain("script.md");
        expect(dek042?.line).toBe(13);
        expect(dek042?.slug).toBe("intro");
        expect(lintDeck(join(root, "decks", "demo"), { slug: "other" })).toEqual([]);
      },
    );
  });

  test("DEK041: flags a large gap between duration budget and Timeline length", async () => {
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
        const diagnostics = lintDeck(join(root, "decks", "demo"));
        expect(diagnostics.some((d) => d.id === "DEK041")).toBe(true);
      },
    );
  });

  test("DEK041: stays quiet when Timeline is close to the budget", async () => {
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
        expect(diagnostics.some((d) => d.id === "DEK041")).toBe(false);
      },
    );
  });

  test("slug option skips other slides' DEK001", async () => {
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
        expect(diagnostics.some((d) => d.id === "DEK001")).toBe(false);
      },
    );
  });

  test("slug option keeps theme diagnostics", async () => {
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
        const diagnostics = lintDeck(join(root, "decks", "demo"), { slug: "intro" });
        expect(diagnostics.some((d) => d.id === "DEK012")).toBe(true);
      },
    );
  });

  test("slug option keeps DEK041 and filters DEK040 to that slide", async () => {
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

hello dek

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
        const diagnostics = lintDeck(join(root, "decks", "demo"), { slug: "extra" });
        expect(diagnostics.some((d) => d.id === "DEK041")).toBe(true);
        expect(diagnostics.some((d) => d.id === "DEK040")).toBe(false);
      },
    );
  });

  test("attaches slug to DEK001, DEK003, and DEK040", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## intro

hello dek

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
        expect(diagnostics.find((d) => d.id === "DEK003")?.slug).toBe("intro");
        expect(diagnostics.find((d) => d.id === "DEK040")?.slug).toBe("intro");
      },
    );
  });

  test("attaches slug to DEK001", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const dek001 = lintDeck(join(root, "decks", "demo")).find((d) => d.id === "DEK001");
      expect(dek001?.slug).toBe("intro");
    });
  });
});
