import { join } from "node:path";
import { textRuns } from "../../../src/core/phrases.ts";
import { lintFindings, must, type Project, type Scenario, warned } from "../scenario.ts";

const SCRIPT = `---
# yaml-language-server: $schema=../../.dek/schema.json
title: "待ち時間を減らす"
duration: 1m
---

## 待ち時間 {#wait}

私たちのチームでは、プルリクエストのたびに
十二分間もテストの完了を待っていました。
一日に四十回ほど出すので、合わせると八時間になります。

## 何が起きたか {#problem}

待ち時間が長いので、変更をまとめて出すようになりました。
ひとつひとつのレビューは大きくなり、読むのに時間がかかります。
その結果、見落としが少しずつ増えていきました。

## これから {#next}

まずは自分たちのパイプラインを一週間計測するところから始めます。
遅い手順は、たいてい予想とは違うところにあります。
直すのは、そのあとです。
`;

/** The paragraph the user must keep word for word: long enough to wrap over several lines. */
const LEAD =
  "待ち時間が長いので変更をまとめて出すようになり、ひとつひとつのレビューが大きくなって、結果として見落としが少しずつ増えていきました。";

const SLIDES: Record<string, string> = {
  wait: `<section class="slide" data-layout="title">
  <h2 class="slide-title">待ち時間は十二分</h2>
</section>
`,
  problem: `<section class="slide" data-layout="default">
  <h2 class="slide-title">待つほどレビューが大きくなる</h2>
  <p class="lead">${LEAD}</p>
</section>
`,
  next: `<section class="slide" data-layout="title">
  <h2 class="slide-title">まず一週間計測する</h2>
</section>
`,
};

/** The slide's own stylesheet takes the theme's phrase breaking away from the paragraph. */
const CSS = `.slide .lead {
  font-size: 1.4em;
  word-break: normal;
}
`;

/**
 * Text as a reader sees it, read as dek reads a slide's text: character references decoded, and
 * what is not drawn as text, a stylesheet or a script, left out. The markup and the line breaks an
 * author may add are gone.
 */
function shown(html: string): string {
  return textRuns(html).join("").replace(/\s+/g, "");
}

/**
 * Each declaration of a property that decides where Japanese may break, as `property: value`.
 * Only what keeps phrases whole is let through: `word-break: auto-phrase`, or a value that takes
 * it from `.slide`, and any `line-break` but `anywhere`. A stylesheet that breaks anywhere instead
 * leaves no text with `word-break: normal`, which is all DEK035 measures.
 */
function breaking(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(
    /(?<![\w.#-])(word-break|line-break)\s*:\s*([^;{}()"'<>]*)/gi,
  )) {
    const property = (match[1] ?? "").toLowerCase();
    const value = (match[2] ?? "")
      .replace(/!\s*important\s*$/i, "")
      .trim()
      .toLowerCase();
    const keeps =
      property === "word-break"
        ? ["auto-phrase", "inherit", "unset"].includes(value)
        : value !== "anywhere";
    if (!keeps) {
      found.push(`${property}: ${value}`);
    }
  }
  return found;
}

/** What setup itself declares, which the user's own fix by `<br>` may leave as it is. */
const SEEDED_BREAKING: Record<string, string[]> = {
  "decks/talk/slides/problem.css": breaking(CSS),
};

/**
 * Where a deck's own styles and slides live: what an author writes, not what the build writes
 * from it, which puts `keep-all` before each `auto-phrase` for browsers without it.
 */
const SOURCES = [
  "theme.css",
  "decks/*/theme.css",
  "decks/*/slides/**/*.{css,html}",
  "decks/*/assets/**/*.css",
];

/**
 * Every stylesheet and slide the project's author writes that lets Japanese break inside a
 * phrase, past what setup wrote, and every element said to be in another language, which
 * Chromium does not break by phrase: two ways around DEK035 that leave the paragraph as hard to
 * read.
 */
async function aroundTheRule(project: Project): Promise<string[]> {
  const found: string[] = [];
  const paths = [
    ...new Set(SOURCES.flatMap((source) => [...new Bun.Glob(source).scanSync(project.dir)])),
  ].sort();
  for (const path of paths) {
    const text = (await project.read(path)) ?? "";
    const seeded = [...(SEEDED_BREAKING[path] ?? [])];
    for (const declaration of breaking(text)) {
      const at = seeded.indexOf(declaration);
      if (at >= 0) {
        seeded.splice(at, 1);
      } else {
        found.push(`${path} sets ${declaration}, which breaks inside a phrase`);
      }
    }
    if (path.endsWith(".html")) {
      new HTMLRewriter()
        .on("[lang]", {
          element(el) {
            const lang = el.getAttribute("lang") ?? "";
            if (!/^ja(?:-|$)/i.test(lang)) {
              found.push(`${path} sets lang="${lang}", so the text is not broken as Japanese`);
            }
          },
        })
        .transform(text);
    }
  }
  return found;
}

/**
 * A Japanese deck whose one slide breaks lines inside a phrase (DEK035, a warning lint passes
 * with): its stylesheet sets word-break: normal where the theme breaks by phrase. The text must
 * stay as the user wrote it, the script too, so the deck stays Japanese, and nothing may break the
 * paragraph anywhere instead.
 */
export default {
  id: "ja-line-break",
  prompt:
    "talk デッキの「待つほどレビューが大きくなる」のスライドで、日本語が単語の途中で改行されていて読みにくいです。文章は変えずに直してください。",
  needsBrowser: true,
  async setup(project) {
    await must(project.dekc(["init", ".", "--deck", "talk"]), "dekc init");
    for (const path of new Bun.Glob("decks/talk/slides/*").scanSync(project.dir)) {
      await Bun.file(join(project.dir, path)).delete();
    }
    await project.write("decks/talk/script.md", SCRIPT);
    for (const [slug, html] of Object.entries(SLIDES)) {
      await project.write(`decks/talk/slides/${slug}.html`, html);
    }
    await project.write("decks/talk/slides/problem.css", CSS);
  },
  async check(project) {
    const { problems, diagnostics } = await lintFindings(project, { visual: true });
    const found = [...problems, ...warned(diagnostics, ["DEK035"])];
    if ((await project.read("decks/talk/script.md")) !== SCRIPT) {
      found.push("script.md is not the script the user wrote");
    }
    found.push(...(await aroundTheRule(project)));
    const html = (await project.read("decks/talk/slides/problem.html")) ?? "";
    if (!shown(html).includes(LEAD)) {
      found.push("the paragraph on slides/problem.html is not the text the user wrote");
    }
    return found;
  },
  solution: [
    "cd decks/talk && dekc lint --visual",
    async (dir) => {
      const path = join(dir, "decks/talk/slides/problem.css");
      await Bun.write(path, (await Bun.file(path).text()).replace("  word-break: normal;\n", ""));
    },
    "cd decks/talk && dekc lint --visual",
  ],
} satisfies Scenario;
