import { describe, expect, test } from "bun:test";
import { type Block, scriptBlocks, slideBlocks } from "../../../src/plugins/words/text.ts";

const texts = (blocks: Block[]) => blocks.map((block) => block.text);

/** Each character of each block is the character the source has at its offset. */
function expectMapped(source: string, blocks: Block[]): void {
  for (const block of blocks) {
    expect(block.at).toHaveLength(block.text.length);
    [...block.text].forEach((char, index) => {
      const at = block.at[index] as number;
      if (char !== " " && source[at] !== "&") {
        expect(source[at]).toBe(char);
      }
    });
  }
}

describe("slideBlocks", () => {
  test("joins inline elements into one text, and keeps blocks apart", () => {
    const html =
      '<section class="slide"><h2>見出し</h2><p>地味に<b>効</b>きます</p><ul><li>一つ</li><li>二つ</li></ul></section>';
    const blocks = slideBlocks(html);
    expect(texts(blocks)).toEqual(["見出し", "地味に効きます", "一つ", "二つ"]);
    expect(blocks[1]?.at[3]).toBe(html.indexOf("効"));
    expectMapped(html, blocks);
  });

  test("reads only the words a reader sees, aria-hidden ones included", () => {
    const html = [
      '<section class="slide">',
      "<style>p { color: red }</style><script>let x = 1</script>",
      "<template><p>later</p></template><noscript>no</noscript><!-- a note -->",
      '<p aria-hidden="true">飾り</p><p title="a > b">本文</p>',
      "</section>",
    ].join("\n");
    expect(texts(slideBlocks(html))).toEqual(["飾り", "本文"]);
  });

  test("reads character references as characters, at the place they start", () => {
    const html = "<p>A &amp; B&#x3001;&nbsp;C</p>";
    const [block] = slideBlocks(html);
    expect(block?.text).toBe("A & B、 C");
    expect(block?.at[2]).toBe(html.indexOf("&amp;"));
    expect(block?.at[6]).toBe(html.indexOf("&nbsp;"));
  });

  test("reads each run of whitespace, and a line break, as one space", () => {
    const html = "<p>\n  one\n   two<br>three<br/>  four  </p>";
    expect(texts(slideBlocks(html))).toEqual(["one two three four"]);
    expectMapped(html, slideBlocks(html));
  });

  test("joins Japanese the source breaks in the middle, but keeps a space or a <br> written there", () => {
    const html =
      "<p>解像\n    度が<b>高い\n</b>。日本語\nand English\n「引用」\n解像 度<br>解像<br>\n度</p>";
    const blocks = slideBlocks(html);
    expect(texts(blocks)).toEqual(["解像度が高い。日本語 and English 「引用」解像 度 解像 度"]);
    expect(blocks[0]?.at[2]).toBe(html.indexOf("度"));
    expectMapped(html, blocks);
  });

  test("leaves out the reading ruby puts over a word", () => {
    const html =
      "<p><ruby>腹<rp>(</rp><rt>はら</rt><rp>)</rp></ruby>落ち、<ruby>漢<rt>かん<rb>字<rt>じ</ruby>です</p><p>次</p>";
    expect(texts(slideBlocks(html))).toEqual(["腹落ち、漢字です", "次"]);
    expectMapped(html, slideBlocks(html));
  });
});

describe("scriptBlocks", () => {
  test("reads headings without their id, paragraphs, and list items, by line", () => {
    const md = [
      "---",
      "title: 効く話",
      "---",
      "",
      "## 表紙で効かせる {#cover}",
      "",
      "地味に**効**きます。",
      "- 一つ目は [土台](https://example.com)",
      "1. 二つ目",
    ].join("\n");
    const blocks = scriptBlocks(md);
    expect(texts(blocks)).toEqual([
      "表紙で効かせる",
      "地味に効きます。",
      "一つ目は 土台",
      "二つ目",
    ]);
    expect(blocks[0]?.at[3]).toBe(md.indexOf("効かせる"));
    expectMapped(md, blocks);
  });

  test("leaves out code, comments, and blockquotes, which the audience never gets", () => {
    const md = [
      "## intro",
      "",
      "```ts",
      "const 効く = 1;",
      "```",
      "> 効かせるように話す",
      "<!-- 効く",
      "まだコメント -->",
      "本文 `効く` の後",
    ].join("\n");
    expect(texts(scriptBlocks(md))).toEqual(["intro", "本文 の後"]);
  });

  test("joins the lines of a paragraph or an item, and Japanese the source breaks in the middle", () => {
    const md = [
      "## 解像",
      "度の話",
      "",
      "解像",
      "度が高い。",
      "And English",
      "- 一つ目の解像",
      "  度",
      "- 二つ目",
      "<!-- 注 -->",
      "後",
      "",
      "| 解像 |",
      "| 度 |",
    ].join("\n");
    const blocks = scriptBlocks(md);
    expect(texts(blocks)).toEqual([
      "解像",
      "度の話",
      "解像度が高い。 And English",
      "一つ目の解像度",
      "二つ目",
      "後",
      "解像",
      "度",
    ]);
    expect(blocks[2]?.at[2]).toBe(md.indexOf("度が"));
    expectMapped(md, blocks);
  });

  test("keeps a table's cells apart", () => {
    const md = "| 入口 | 出口 |\n| --- | --- |\n| 土台 | 核心 |";
    expect(texts(scriptBlocks(md))).toEqual(["入口", "出口", "土台", "核心"]);
    expectMapped(md, scriptBlocks(md));
  });
});
