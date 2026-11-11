import { join } from "node:path";
import { lintFindings, must, type Scenario, warned } from "../scenario.ts";

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

/** Text as a reader sees it: the markup and the line breaks an author may add are gone. */
function shown(html: string): string {
  let text = "";
  new HTMLRewriter()
    .on("*", {
      text(chunk) {
        text += chunk.text;
      },
    })
    .transform(html);
  return text.replace(/\s+/g, "");
}

/**
 * A Japanese deck whose one slide breaks lines inside a phrase (DEK035, a warning lint passes
 * with): its stylesheet sets word-break: normal where the theme breaks by phrase. The text must
 * stay as the user wrote it.
 */
export default {
  id: "ja-line-break",
  prompt:
    "talk デッキの「待つほどレビューが大きくなる」のスライドで、日本語が単語の途中で改行されていて読みにくいです。文章は変えずに直してください。",
  needsBrowser: true,
  async setup(project) {
    await must(project.dekc(["init", ".", "--deck", "talk", "--no-install"]), "dekc init");
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
