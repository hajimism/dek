import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Diagnostic } from "../../src/core/diagnostic.ts";
import { lintDeck } from "../../src/core/lint.ts";
import { resolveDeck } from "../../src/core/resolve.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const SLUGS = ["a", "b", "c", "d"];

const script = `---
title: Demo
---

${SLUGS.map((slug) => `## ${slug}\n\nsaid on ${slug}\n`).join("\n")}`;

const slide = (slug: string) =>
  slideDocument(`<section class="slide">
  <h2 class="slide-title">${slug}</h2>
  <div class="card"><p class="note">${slug}</p></div>
</section>`);

async function lintStyles(
  styles: Record<string, string>,
  options: { slug?: string } = {},
): Promise<Diagnostic[]> {
  return withTempProject(
    {
      decks: [
        {
          name: "demo",
          script,
          slides: Object.fromEntries(SLUGS.map((slug) => [slug, slide(slug)])),
          theme: `.slide .card { color: var(--fg); }\n.slide .note { color: var(--muted); }\n`,
          styles,
        },
      ],
    },
    async (root) => {
      const resolved = resolveDeck(join(root, "decks", "demo"));
      return lintDeck(resolved, options).filter((d) => d.id === "DEK026");
    },
  );
}

const DARK_CARD = ".card {\n  --muted: var(--bg);\n}\n";

describe("DEK026 repeated slide styles", () => {
  test("flags a declaration three slides repeat, on each of them", async () => {
    const found = await lintStyles({ a: DARK_CARD, b: DARK_CARD, c: DARK_CARD });
    expect(found.map((d) => d.slug)).toEqual(["a", "b", "c"]);
    expect(found[0]).toMatchObject({
      severity: "warning",
      path: expect.stringContaining(join("slides", "a.css")),
      line: 2,
      message: ".card { --muted: var(--bg) } is also in slides/b.css and slides/c.css",
      hint: "write .slide .card { --muted: var(--bg) } once in theme.css and delete it from slides/a.css, slides/b.css, and slides/c.css; it also reaches slides/d.html, which uses .card without it, so check that slide after the move",
      data: {
        selector: ".card",
        declarations: ["--muted: var(--bg)"],
        slides: ["a", "b", "c"],
        alsoReaches: ["d"],
      },
    });
  });

  // A hint that moves the rule into theme.css as the slide wrote it, `.card { … }`, would trade
  // DEK026 for DEK012: the theme scopes every selector under .slide itself.
  test("names the rule as theme.css must write it, under .slide", async () => {
    const child = ".slide > .card { --muted: var(--bg); }";
    const found = await lintStyles({ a: child, b: child, c: child, d: child });
    expect(found[0]?.hint).toBe(
      "write .slide > .card { --muted: var(--bg) } once in theme.css and delete it from slides/a.css, slides/b.css, slides/c.css, and slides/d.css",
    );
    expect(found[0]?.data?.alsoReaches).toBeUndefined();
  });

  test("leaves a declaration only two slides share", async () => {
    expect(await lintStyles({ a: DARK_CARD, b: DARK_CARD })).toEqual([]);
  });

  test("counts .card and .slide .card as one selector, as the slide's scope does", async () => {
    const found = await lintStyles({
      a: DARK_CARD,
      b: ".slide .card { --muted: var(--bg); }",
      c: ".slide  .card {\n  --muted:  var(--bg);\n}",
    });
    expect(found.map((d) => d.slug)).toEqual(["a", "b", "c"]);
    expect(found[1]?.message).toStartWith(".slide .card {");
  });

  test("tells a child of the slide from any descendant", async () => {
    const found = await lintStyles({
      a: DARK_CARD,
      b: DARK_CARD,
      c: ".slide > .card { --muted: var(--bg); }",
    });
    expect(found).toEqual([]);
  });

  test("tells a rule inside @media from the same rule outside it", async () => {
    const found = await lintStyles({
      a: DARK_CARD,
      b: DARK_CARD,
      c: `@media (min-width: 100px) {\n${DARK_CARD}}`,
    });
    expect(found).toEqual([]);
  });

  test("reports a copied block once per slide, with what that slide shares", async () => {
    const block = ".card {\n  --muted: var(--bg);\n  padding: var(--gap);\n}\n";
    const found = await lintStyles({ a: block, b: block, c: block, d: DARK_CARD });
    expect(found.map((d) => [d.slug, d.data?.declarations, d.data?.slides])).toEqual([
      ["a", ["--muted: var(--bg)", "padding: var(--gap)"], ["a", "b", "c", "d"]],
      ["b", ["--muted: var(--bg)", "padding: var(--gap)"], ["a", "b", "c", "d"]],
      ["c", ["--muted: var(--bg)", "padding: var(--gap)"], ["a", "b", "c", "d"]],
      ["d", ["--muted: var(--bg)"], ["a", "b", "c", "d"]],
    ]);
  });

  test("lists the declarations in the order the slide writes them", async () => {
    const found = await lintStyles({
      a: ".card {\n  padding: var(--gap);\n  --muted: var(--bg);\n}\n",
      b: ".card {\n  --muted: var(--bg);\n  padding: var(--gap);\n}\n",
      c: ".card {\n  --muted: var(--bg);\n  padding: var(--gap);\n}\n",
    });
    expect(found.map((d) => d.data?.declarations)).toEqual([
      ["padding: var(--gap)", "--muted: var(--bg)"],
      ["--muted: var(--bg)", "padding: var(--gap)"],
      ["--muted: var(--bg)", "padding: var(--gap)"],
    ]);
  });

  test("splits a selector list, so a shared part is found alone", async () => {
    const found = await lintStyles({
      a: ".card, .note { --muted: var(--bg); }",
      b: DARK_CARD,
      c: DARK_CARD,
    });
    expect(found.map((d) => [d.slug, d.data?.selector])).toEqual([
      ["a", ".card"],
      ["b", ".card"],
      ["c", ".card"],
    ]);
  });

  test("leaves keyframes alone: each slide's are its own", async () => {
    const pop = "@keyframes pop {\n  from { opacity: 0; }\n}\n";
    expect(await lintStyles({ a: pop, b: pop, c: pop })).toEqual([]);
  });

  test("shows up in one slide's check", async () => {
    const found = await lintStyles({ a: DARK_CARD, b: DARK_CARD, c: DARK_CARD }, { slug: "b" });
    expect(found.map((d) => d.slug)).toEqual(["b"]);
  });
});
