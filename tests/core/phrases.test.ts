import { describe, expect, test } from "bun:test";
import { phraseBoundaries } from "../../src/core/budoux/parser.ts";
import { runKey } from "../../src/core/phrase-runs.ts";
import {
  breaksByPhrase,
  phraseFallbackCss,
  phraseTable,
  textRuns,
} from "../../src/core/phrases.ts";

const slide = (body: string) => `<section class="slide">${body}</section>`;

describe("textRuns", () => {
  test("runs through inline elements and ends at a block or a <br>", () => {
    expect(
      textRuns(slide("<h2>台本を<strong>先に</strong>書く</h2><p>一行目<br>二行目</p>")),
    ).toEqual(["台本を先に書く", "一行目", "二行目"]);
  });

  test("keeps white space as the text node holds it", () => {
    expect(textRuns(slide("\n  <p>\n    台本を書く\n  </p>\n"))).toEqual([
      "\n  ",
      "\n    台本を書く\n  ",
      "\n",
    ]);
  });

  test("leaves out code, script, style, and drawings, each ending the run before it", () => {
    expect(
      textRuns(
        slide(
          "<p>コマンド<code>dekc ls</code>を使う<script>let a = '<p>';</script><style>p{}</style><svg><text>図</text></svg>終わり</p>",
        ),
      ),
    ).toEqual(["コマンド", "を使う", "終わり"]);
  });

  test("reads ruby as its base, without the readings", () => {
    expect(
      textRuns(slide("<p><ruby>漢<rp>(</rp><rt>かん</rt><rp>)</rp>字<rt>じ</rt></ruby>を読む</p>")),
    ).toEqual(["漢字を読む"]);
  });

  test("decodes character references and line ends as the text node holds them", () => {
    expect(textRuns(slide("<p>Q&amp;Aの&#x4e00;&copy2026&notin;\r\nと\r</p>"))).toEqual([
      "Q&Aの一©2026∉\nと\n",
    ]);
  });

  test("reads a legacy name without its `;` as text does, by its longest prefix", () => {
    expect(textRuns(slide("<p>&notit; &ampx</p>"))).toEqual(["¬it; &x"]);
  });

  test("drops a NUL, which the parser ignores in a body", () => {
    expect(textRuns(slide("<p>台\0本</p>"))).toEqual(["台本"]);
  });

  test("goes on across a comment", () => {
    expect(textRuns(slide("<p>台本を<!-- note -->書く</p>"))).toEqual(["台本を書く"]);
  });
});

describe("phraseTable", () => {
  test("maps each Japanese run with a phrase boundary to BudouX's offsets", () => {
    const text = "台本を先に書いてから画面を組み立てる";
    expect(phraseTable(slide(`<p>${text}</p><p>English only</p><p>短い</p>`))).toEqual({
      [runKey(text)]: phraseBoundaries(text),
    });
  });

  test("is empty for a slide without Japanese", () => {
    expect(phraseTable(slide("<h2>Write the script first</h2>"))).toEqual({});
  });
});

describe("runKey", () => {
  test("tells texts apart by their characters and their length", () => {
    expect(runKey("台本を書く")).toBe(runKey("台本を書く"));
    expect(runKey("台本を書く")).not.toBe(runKey("台本を書いた"));
    expect(runKey("")).not.toBe(runKey(" "));
  });
});

describe("breaksByPhrase", () => {
  test("holds for Japanese, with or without a region", () => {
    expect(breaksByPhrase("ja")).toBe(true);
    expect(breaksByPhrase("ja-JP")).toBe(true);
    expect(breaksByPhrase("JA")).toBe(true);
    expect(breaksByPhrase("en")).toBe(false);
    expect(breaksByPhrase("jav")).toBe(false);
  });
});

describe("phraseFallbackCss", () => {
  test("puts keep-all before each auto-phrase, which a browser without it falls back to", () => {
    const css = phraseFallbackCss(".slide { word-break: auto-phrase; text-wrap: pretty; }");
    expect(css).toContain(
      ".slide { word-break: keep-all; word-break: auto-phrase; text-wrap: pretty; }",
    );
  });

  test("carries !important to both", () => {
    expect(phraseFallbackCss(".a{word-break:auto-phrase !important}")).toContain(
      ".a{word-break:keep-all !important; word-break: auto-phrase !important}",
    );
  });

  test("reaches a rule inside an at-rule, and leaves other values alone", () => {
    const css = phraseFallbackCss(
      "@media (min-width: 1px) { .a { word-break: auto-phrase } } .b { word-break: normal }",
    );
    expect(css).toContain(
      "@media (min-width: 1px) { .a { word-break: keep-all; word-break: auto-phrase } }",
    );
    expect(css).toContain(".b { word-break: normal }");
  });

  test("lets a phrase too long for its line break where it must, only without auto-phrase", () => {
    expect(phraseFallbackCss("")).toContain(
      "@supports not (word-break: auto-phrase) { .slide { overflow-wrap: break-word; } }",
    );
  });
});
