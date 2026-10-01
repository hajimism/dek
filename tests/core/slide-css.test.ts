import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readTheme } from "../../src/core/assets.ts";
import { buildDeck } from "../../src/core/build.ts";
import { lintDeck } from "../../src/core/lint.ts";
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
        expect(css.startsWith(".slide { --fg: #fff; }\n::view-transition { --fg: #fff; }\n")).toBe(
          true,
        );
        expect(css).toContain(
          '.slide:where([data-slug="usb"]) .usb-mark { color: var(--accent); }',
        );
      },
    );
  });

  test("readTheme inlines a url() token once, not again for the transition", async () => {
    const [demo] = deck().decks;
    const project = {
      decks: [
        {
          ...demo,
          name: "demo",
          theme: ".slide { --bg-image: url(assets/bg.png); }\n",
          assets: { "bg.png": "png" },
        },
      ],
    };
    await withTempProject(project, async (root) => {
      const css = readTheme(join(root, "decks", "demo"), true);
      expect(css.match(/data:image\/png/g)).toHaveLength(1);
    });
  });

  test("dekc build carries slide stylesheets into the single file", async () => {
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
  test("DEKC010: a class defined in the slide's stylesheet is defined for that slide only", async () => {
    const leaky = slideDocument(`<section class="slide">
  <h2 class="slide-title usb-mark">intro</h2>
</section>`);
    await withTempProject(
      deck({ styles: { usb: ".usb-mark { color: var(--accent); }\n" }, slides: { intro: leaky } }),
      async (root) => {
        const found = lintDeck(join(root, "decks", "demo")).filter((d) => d.id === "DEKC010");
        expect(found).toHaveLength(1);
        expect(found[0]?.path).toBe(join(root, "decks", "demo", "slides", "intro.html"));
      },
    );
  });

  test("DEKC013: slide classes do not count toward the theme's class budget", async () => {
    const many = Array.from({ length: 50 }, (_, i) => `.local-${i} { opacity: 0; }`).join("\n");
    await withTempProject(deck({ styles: { usb: many } }), async (root) => {
      expect(lintDeck(join(root, "decks", "demo")).some((d) => d.id === "DEKC013")).toBe(false);
    });
  });

  test("DEKC014: raw values in a slide stylesheet are reported against that file", async () => {
    await withTempProject(
      deck({ styles: { usb: ".slide { --local: 12px; }\n.usb-mark { margin-top: 12px; }\n" } }),
      async (root) => {
        const found = lintDeck(join(root, "decks", "demo")).filter((d) => d.id === "DEKC014");
        expect(found).toHaveLength(1);
        expect(found[0]?.path).toBe(join(root, "decks", "demo", "slides", "usb.css"));
        expect(found[0]?.line).toBe(2);
      },
    );
  });

  test("DEKC012: view transitions stay in theme.css", async () => {
    await withTempProject(
      deck({ styles: { usb: "::view-transition-old(root) { animation: none; }\n" } }),
      async (root) => {
        const found = lintDeck(join(root, "decks", "demo")).filter((d) => d.id === "DEKC012");
        expect(found).toHaveLength(1);
        expect(found[0]?.path).toBe(join(root, "decks", "demo", "slides", "usb.css"));
      },
    );
  });

  test("DEKC012: page-wide rules do not belong in a slide stylesheet", async () => {
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
        const found = lintDeck(join(root, "decks", "demo")).filter((d) => d.id === "DEKC012");
        expect(found.map(({ message, line, hint }) => ({ message, line, hint }))).toEqual([
          {
            message: '":root" never matches inside a slide',
            line: 1,
            hint: "move it to theme.css, or start it at .slide",
          },
          {
            message: '"html, body" never matches inside a slide',
            line: 2,
            hint: "move it to theme.css, or start it at .slide",
          },
          {
            message: "@font-face applies to the whole deck",
            line: 3,
            hint: "move it to theme.css",
          },
          { message: "@import applies to the whole deck", line: 4, hint: "move it to theme.css" },
        ]);
      },
    );
  });

  test("DEKC020 / DEKC021 / DEKC023: url() in a slide stylesheet follows the slide HTML's asset rules", async () => {
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
          (d) => d.id === "DEKC020" || d.id === "DEKC021" || d.id === "DEKC023",
        );
        expect(found.map((d) => [d.id, d.message, d.line])).toEqual([
          ["DEKC023", 'asset "../assets/up.svg" must be referenced as assets/up.svg', 2],
          ["DEKC020", 'remote URL "https://cdn.example.com/x.png"', 3],
          ["DEKC021", 'missing file "assets/gone.svg"', 5],
        ]);
        expect(found[0]?.path).toBe(join(root, "decks", "demo", "slides", "usb.css"));
      },
    );
  });

  test("DEKC002: a slide stylesheet with no section is reported", async () => {
    await withTempProject(deck({ styles: { gone: ".x { opacity: 0; }\n" } }), async (root) => {
      const found = lintDeck(join(root, "decks", "demo")).filter((d) => d.id === "DEKC002");
      expect(found).toHaveLength(1);
      expect(found[0]?.path).toBe(join(root, "decks", "demo", "slides", "gone.css"));
    });
  });
});

describe("dekc mv", () => {
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
