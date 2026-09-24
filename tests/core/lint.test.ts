import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DekError, lintDeck, resolveDeck } from "../../src/core/index.ts";
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
      expect(dek001?.path).toBe(join(root, "decks", "demo", "script.md"));
      expect(dek001?.line).toBe(5);
      expect(dek001?.data).toEqual({ expected: "slides/intro.html" });
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
        const hints = diagnostics.filter((d) => d.id === "DEK001" || d.id === "DEK002");
        expect(hints.map((d) => d.hint)).toEqual([
          "run `dek mv leftover intro`",
          "run `dek mv leftover intro`",
        ]);
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

  test("DEK041: without a Timeline, compares the estimated reading time to the budget", async () => {
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
        const dek041 = lintDeck(join(root, "decks", "demo")).find((d) => d.id === "DEK041");
        expect(dek041).toMatchObject({
          message: "the script reads in about 0:01, budget 5m; more than 35% apart",
          data: { estimateSeconds: 1, budgetSeconds: 300 },
          hint: "write more for the slot, or shorten duration in the frontmatter",
        });
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

  test("DEK003 lists the beat ids and indexes the slide can use", async () => {
    const diagnostics = await lintIntro(
      `<section class="slide" data-layout="default">
  <h2 class="slide-title">intro</h2>
  <p data-step="3">late</p>
</section>`,
      { script: beatScript },
    );
    const hint = diagnostics.find((d) => d.id === "DEK003")?.hint;
    expect(hint).toBe("use hook, turn, or 1-2");
  });

  test("DEK003 says when the section has no beats", async () => {
    const diagnostics = await lintIntro(`<section class="slide" data-layout="default">
  <h2 class="slide-title">intro</h2>
  <p data-step="1">late</p>
</section>`);
    const hint = diagnostics.find((d) => d.id === "DEK003")?.hint;
    expect(hint).toBe('add a ### beat under "## intro" in script.md, or drop data-step');
  });

  test("DEK010 names the slide stylesheet and the known classes", async () => {
    const diagnostics = await lintIntro(
      `<section class="slide" data-layout="title">
  <h2 class="slide-title mystery">intro</h2>
</section>`,
      { theme: ".slide {}\n.slide .slide-title {}\n.slide .node {}\n" },
    );
    const hint = diagnostics.find((d) => d.id === "DEK010")?.hint;
    expect(hint).toBe("define it in slides/intro.css, or use one of: node, slide, slide-title");
  });

  test("DEK010 suggests a data attribute when the slide has a script to find it", async () => {
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
          "export default { draw() {} } satisfies DekSlide;\n",
        );
        const hint = lintDeck(join(root, "decks", "demo")).find((d) => d.id === "DEK010")?.hint;
        expect(hint).toBe(
          "define it in slides/intro.css, or use one of: slide, slide-title; to find an element from slides/intro.ts, use a data-* attribute instead",
        );
      },
    );
  });

  test("DEK011 points style attributes at the slide stylesheet", async () => {
    const diagnostics = await lintIntro(`<section class="slide" data-layout="title">
  <h2 class="slide-title" style="color: red">intro</h2>
</section>`);
    const hint = diagnostics.find((d) => d.id === "DEK011")?.hint;
    expect(hint).toBe("move it to a class in slides/intro.css, using token var()");
  });

  test("DEK011 points scripts at the slide script", async () => {
    const diagnostics = await lintIntro(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <script>1</script>
</section>`);
    const hint = diagnostics.find((d) => d.id === "DEK011")?.hint;
    expect(hint).toBe("move motion to slides/intro.ts as a draw(t) function");
  });

  test("DEK020 names the asset path to download into", async () => {
    const diagnostics = await lintIntro(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <img src="https://cdn.example.com/img/logo.png?v=2" alt="">
</section>`);
    const hint = diagnostics.find((d) => d.id === "DEK020")?.hint;
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
    expect(lineOf("DEK003")).toBe(3);
    expect(lineOf("DEK010")).toBe(4);
    expect(lineOf("DEK011")).toBe(5);
    expect(lineOf("DEK020")).toBe(6);
    expect(lineOf("DEK021")).toBe(7);
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
    expect(dataOf("DEK003")).toEqual({ step: "hok", choices: ["hook", "1"] });
    expect(dataOf("DEK014")).toEqual({ property: "font-size", value: "96px" });
    expect(dataOf("DEK020")).toEqual({ url: "https://example.com/a.png" });
    expect(dataOf("DEK021")).toEqual({ src: "assets/missing.png" });
  });

  test("names the unknown class as data", async () => {
    const diagnostics = await lintSlide(`<section class="slide">
  <p class="headline">x</p>
</section>
`);
    expect(diagnostics.find((d) => d.id === "DEK010")?.data).toEqual({ class: "headline" });
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
        const dek040 = lintDeck(join(root, "decks", "demo")).find((d) => d.id === "DEK040");
        expect(dek040?.data).toEqual({ word: "AI" });
      },
    );
  });
});

describe("DEK014 hints", () => {
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
          (d) => d.id === "DEK014" && d.path?.endsWith(".css") && !d.path.endsWith("theme.css"),
        )?.hint,
    );
  }

  test("offers the theme's color tokens for a raw color", async () => {
    expect(await hintFor(".x { color: #ff0066; }\n")).toBe("use var(--accent) or var(--fg)");
  });

  test("offers the size tokens for a raw font-size", async () => {
    expect(await hintFor(".x { font-size: 96px; }\n")).toBe(
      "use var(--size-body) or var(--size-stat)",
    );
  });

  test("offers length tokens for raw spacing and radius", async () => {
    expect(await hintFor(".x { margin: 12px; }\n")).toBe("use var(--gap)");
    expect(await hintFor(".x { border-radius: 8px; }\n")).toBe("use var(--radius)");
  });

  test("offers the font tokens for a raw font-family", async () => {
    expect(await hintFor('.x { font-family: "Noto Sans"; }\n')).toBe("use var(--font-body)");
  });

  test("points at theme.css when no token fits", async () => {
    expect(await hintFor(".x { transition: opacity 200ms; }\n")).toBe("use var(--step-transition)");
    expect(await hintFor(".x { width: 100px; }\n")).toBe(
      "add a token for it to theme.css and use var() here",
    );
  });
});
