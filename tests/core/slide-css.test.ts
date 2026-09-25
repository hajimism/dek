import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildDeck } from "../../src/core/build.ts";
import { readTheme } from "../../src/core/html.ts";
import { lintDeck } from "../../src/core/index.ts";
import { renameSection } from "../../src/core/mv.ts";
import { playerEmbed } from "../helpers/embed.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const script = `---
title: Demo
---

## intro

hello

## usb

world
`;

const theme = ".slide { --fg: #fff; }\n.slide .slide-title { color: var(--fg); }\n";

const intro = slideDocument(`<section class="slide">
  <h2 class="slide-title">intro</h2>
</section>`);

const usb = slideDocument(`<section class="slide">
  <h2 class="slide-title usb-mark">one file</h2>
</section>`);

const deck = (
  extra: { styles?: Record<string, string>; slides?: Record<string, string> } = {},
) => ({
  decks: [
    {
      name: "demo",
      script,
      theme,
      slides: { intro, usb, ...extra.slides },
      ...(extra.styles ? { styles: extra.styles } : {}),
    },
  ],
});

describe("slide stylesheets in the page", () => {
  test("readTheme appends each slide's stylesheet, scoped to that slide", async () => {
    await withTempProject(
      deck({ styles: { usb: ".usb-mark { color: var(--accent); }\n" } }),
      async (root) => {
        const css = readTheme(join(root, "decks", "demo"), false);
        expect(css.startsWith(theme)).toBe(true);
        expect(css).toContain(
          '.slide:where([data-slug="usb"]) .usb-mark { color: var(--accent); }',
        );
      },
    );
  });

  test("dek build carries slide stylesheets into the single file", async () => {
    await withTempProject(
      deck({ styles: { usb: ".usb-mark { color: var(--accent); }\n" } }),
      async (root) => {
        const { playerScript } = await playerEmbed();
        const result = await buildDeck(join(root, "decks", "demo"), { playerScript });
        const html = await readFile(result.outPath, "utf8");
        expect(html).toContain('.slide:where([data-slug="usb"]) .usb-mark');
      },
    );
  });
});

describe("slide stylesheet lint", () => {
  test("DEK010: a class defined in the slide's stylesheet is defined for that slide only", async () => {
    const leaky = slideDocument(`<section class="slide">
  <h2 class="slide-title usb-mark">intro</h2>
</section>`);
    await withTempProject(
      deck({ styles: { usb: ".usb-mark { color: var(--accent); }\n" }, slides: { intro: leaky } }),
      async (root) => {
        const found = lintDeck(join(root, "decks", "demo")).filter((d) => d.id === "DEK010");
        expect(found).toHaveLength(1);
        expect(found[0]?.path).toBe(join(root, "decks", "demo", "slides", "intro.html"));
      },
    );
  });

  test("DEK013: slide classes do not count toward the theme's class budget", async () => {
    const many = Array.from({ length: 50 }, (_, i) => `.local-${i} { opacity: 0; }`).join("\n");
    await withTempProject(deck({ styles: { usb: many } }), async (root) => {
      expect(lintDeck(join(root, "decks", "demo")).some((d) => d.id === "DEK013")).toBe(false);
    });
  });

  test("DEK014: raw values in a slide stylesheet are reported against that file", async () => {
    await withTempProject(
      deck({ styles: { usb: ".slide { --local: 12px; }\n.usb-mark { margin-top: 12px; }\n" } }),
      async (root) => {
        const found = lintDeck(join(root, "decks", "demo")).filter((d) => d.id === "DEK014");
        expect(found).toHaveLength(1);
        expect(found[0]?.path).toBe(join(root, "decks", "demo", "slides", "usb.css"));
        expect(found[0]?.line).toBe(2);
      },
    );
  });

  test("DEK012: view transitions stay in theme.css", async () => {
    await withTempProject(
      deck({ styles: { usb: "::view-transition-old(root) { animation: none; }\n" } }),
      async (root) => {
        const found = lintDeck(join(root, "decks", "demo")).filter((d) => d.id === "DEK012");
        expect(found).toHaveLength(1);
        expect(found[0]?.path).toBe(join(root, "decks", "demo", "slides", "usb.css"));
      },
    );
  });

  test("DEK012: page-wide rules do not belong in a slide stylesheet", async () => {
    await withTempProject(
      deck({
        styles: {
          usb: [
            ":root { --x: 1; }",
            "html, body { margin: 0; }",
            '@font-face { font-family: Local; src: url("assets/local.woff2"); }',
            '@import "other.css";',
            ".usb-mark { opacity: 0; }",
          ].join("\n"),
        },
      }),
      async (root) => {
        const found = lintDeck(join(root, "decks", "demo")).filter((d) => d.id === "DEK012");
        expect(found.map((d) => d.message)).toEqual([
          '":root" never matches inside a slide; page-wide rules belong in theme.css',
          '"html, body" never matches inside a slide; page-wide rules belong in theme.css',
          "@font-face applies to the whole deck; it belongs in theme.css",
          "@import applies to the whole deck; it belongs in theme.css",
        ]);
      },
    );
  });

  test("DEK020 / DEK021 / DEK023: url() in a slide stylesheet follows the slide HTML's asset rules", async () => {
    await withTempProject(
      {
        decks: deck({
          styles: {
            usb: [
              ".a { background: url(assets/ok.svg); }",
              ".b { background: url(../assets/up.svg); }",
              '.c { background: url("https://cdn.example.com/x.png"); }',
              '.d { background: url("data:image/png;base64,AAAA"); }',
              ".e { background: url(assets/gone.svg); }",
            ].join("\n"),
          },
        }).decks.map((entry) => ({ ...entry, assets: { "ok.svg": "<svg/>", "up.svg": "<svg/>" } })),
      },
      async (root) => {
        const found = lintDeck(join(root, "decks", "demo")).filter(
          (d) => d.id === "DEK020" || d.id === "DEK021" || d.id === "DEK023",
        );
        expect(found.map((d) => [d.id, d.message, d.line])).toEqual([
          ["DEK023", 'asset "../assets/up.svg" must be referenced as assets/up.svg', 2],
          ["DEK020", 'remote URL "https://cdn.example.com/x.png"', 3],
          ["DEK021", 'missing file "assets/gone.svg"', 5],
        ]);
        expect(found[0]?.path).toBe(join(root, "decks", "demo", "slides", "usb.css"));
      },
    );
  });

  test("DEK002: a slide stylesheet with no section is reported", async () => {
    await withTempProject(deck({ styles: { gone: ".x { opacity: 0; }\n" } }), async (root) => {
      const found = lintDeck(join(root, "decks", "demo")).filter((d) => d.id === "DEK002");
      expect(found).toHaveLength(1);
      expect(found[0]?.path).toBe(join(root, "decks", "demo", "slides", "gone.css"));
    });
  });
});

describe("dek mv", () => {
  test("moves the slide's stylesheet with its HTML", async () => {
    await withTempProject(
      deck({ styles: { usb: ".usb-mark { opacity: 0; }\n" } }),
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        renameSection(deckDir, "usb", "one-file");
        expect(existsSync(join(deckDir, "slides", "usb.css"))).toBe(false);
        expect(await readFile(join(deckDir, "slides", "one-file.css"), "utf8")).toBe(
          ".usb-mark { opacity: 0; }\n",
        );
      },
    );
  });
});
