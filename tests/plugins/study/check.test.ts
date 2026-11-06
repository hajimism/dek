import { expect, test } from "bun:test";
import type { CheckInput } from "@hajimism/dek/plugin";
import { check } from "../../../src/plugins/study/check.ts";

const slides: Record<string, string> = {
  "slides/planning-fallacy.html":
    '<section class="slide"><h1>計画錯誤</h1><p>楽観的に見積もる傾向に、外部視点で対抗する</p></section>',
  "slides/outside.html":
    '<section class="slide"><h1>外部視点</h1><p>似た計画の実績から、外部視点で見積もる</p></section>',
};

function input(): CheckInput {
  return {
    protocol: 1,
    dek: "0.5.1",
    deck: {
      name: "intro",
      lang: "ja",
      slides: [
        {
          slug: "planning-fallacy",
          title: "計画錯誤",
          html: "slides/planning-fallacy.html",
          css: null,
          ts: null,
        },
        { slug: "outside", title: "外部視点", html: "slides/outside.html", css: null, ts: null },
        { slug: "empty", title: "まだ", html: null, css: null, ts: null },
      ],
    },
  };
}

async function run(study: string | undefined) {
  return check(input(), async (path) => (path === "study.yaml" ? study : slides[path]));
}

test("finds nothing in a deck with no study.yaml", async () => {
  expect(await run(undefined)).toEqual([]);
});

test("finds nothing when every sticker covers the one place its words are", async () => {
  const study = `version: 1
stickers:
  - id: s1
    slide: planning-fallacy
    quote: 外部視点
`;
  expect(await run(study)).toEqual([]);
});

test("STUDY001: a sticker whose words are gone, and where they went when it can tell", async () => {
  const study = `version: 1
stickers:
  - id: gone
    slide: planning-fallacy
    quote: 内部視点
  - id: moved
    slide: planning-fallacy
    quote: 似た計画の実績
  - id: renamed
    slide: fallacy
    quote: 計画錯誤
`;
  expect(await run(study)).toEqual([
    {
      rule: "STUDY001",
      message: "sticker gone: 「内部視点」 is not on slide planning-fallacy",
      path: "study.yaml",
      line: 3,
      hint: "find where the words went in slides/planning-fallacy.html and set the sticker's quote and prefix to them, or delete the sticker",
    },
    {
      rule: "STUDY001",
      message: "sticker moved: 「似た計画の実績」 is not on slide planning-fallacy",
      path: "study.yaml",
      line: 6,
      hint: "the words are on slide outside: set the sticker's `slide: outside`",
    },
    {
      rule: "STUDY001",
      message: "sticker renamed: slide fallacy is not in this deck",
      path: "study.yaml",
      line: 9,
      hint: "the words are on slide planning-fallacy: set the sticker's `slide: planning-fallacy`",
    },
  ]);
});

test("STUDY001: a prefix tells two places apart, and one that matches neither is gone", async () => {
  const study = `version: 1
stickers:
  - id: s1
    slide: outside
    quote: 外部視点
    prefix: 実績から、
  - id: s2
    slide: outside
    quote: 外部視点
    prefix: 内側から、
`;
  const findings = await run(study);
  expect(findings.map((finding) => [finding.rule, finding.line])).toEqual([
    ["STUDY002", 3],
    ["STUDY001", 7],
  ]);
});

test("STUDY001: words still on the sticker's slide are not sent to another", async () => {
  const study = `version: 1
stickers:
  - id: before
    slide: planning-fallacy
    quote: 外部視点
    prefix: 内側から、
  - id: first
    slide: planning-fallacy
    quote: 計画錯誤
  - id: second
    slide: planning-fallacy
    quote: 計画錯誤
  - id: nowhere
    slide: planning-fallacy
    quote: 似た計画の実績
    prefix: 昔の
`;
  expect(await run(study)).toEqual([
    {
      rule: "STUDY001",
      message:
        "sticker before: 「外部視点」 is on slide planning-fallacy, but not after 「内側から、」",
      path: "study.yaml",
      line: 3,
      hint: "set the sticker's prefix to the words right before 「外部視点」 in slides/planning-fallacy.html, or leave the prefix out",
    },
    {
      rule: "STUDY001",
      message:
        "sticker second: every 「計画錯誤」 on slide planning-fallacy has a sticker before this one",
      path: "study.yaml",
      line: 10,
      hint: "delete the sticker, since another already hides these words",
    },
    {
      rule: "STUDY001",
      message: "sticker nowhere: 「似た計画の実績」 is not on slide planning-fallacy",
      path: "study.yaml",
      line: 13,
      hint: "find where the words went in slides/planning-fallacy.html and set the sticker's quote and prefix to them, or delete the sticker",
    },
  ]);
});

test("STUDY002: the hidden words still show elsewhere on the slide", async () => {
  const study = `version: 1
stickers:
  - id: s1
    slide: outside
    quote: 外部視点
    prefix: 実績から、
`;
  expect(await run(study)).toEqual([
    {
      rule: "STUDY002",
      message: "「外部視点」 is hidden by sticker s1 but shows 1 more time on slide outside",
      path: "study.yaml",
      line: 3,
      hint: "add a sticker for each other 「外部視点」 on the slide, with a prefix that tells it apart, or reword the others",
    },
  ]);
});

test("STUDY002 is quiet once every place has its sticker", async () => {
  const study = `version: 1
stickers:
  - id: s1
    slide: outside
    quote: 外部視点
    prefix: 実績から、
  - id: s2
    slide: outside
    quote: 外部視点
`;
  expect(await run(study)).toEqual([]);
});

test("STUDY003: a study.yaml it cannot read", async () => {
  expect(await run("version: 3\n")).toEqual([
    {
      rule: "STUDY003",
      message: "study.yaml is version 3; this dek-study reads version 1",
      path: "study.yaml",
      line: 1,
      hint: "write study.yaml as https://hajimism.github.io/dek/reference/plugins.html#dek-study shows",
    },
  ]);
});
