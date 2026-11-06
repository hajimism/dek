import { expect, test } from "bun:test";
import { readStudy } from "../../../src/plugins/study/study.ts";

test("reads each sticker with the line it starts on", () => {
  const source = `version: 1
stickers:
  - id: s1
    slide: planning-fallacy
    quote: 外部視点
    prefix: 楽観的に見積もる傾向に、
  - id: s2
    slide: intro
    quote: 計画錯誤
`;
  expect(readStudy(source)).toEqual({
    stickers: [
      {
        id: "s1",
        slide: "planning-fallacy",
        quote: "外部視点",
        prefix: "楽観的に見積もる傾向に、",
        line: 3,
      },
      { id: "s2", slide: "intro", quote: "計画錯誤", line: 7 },
    ],
    problems: [],
  });
});

test("says what is wrong with a file it cannot use, and where", () => {
  expect(readStudy("stickers: [").problems).toEqual([
    { message: expect.stringContaining("not YAML"), line: 1 },
  ]);
  expect(readStudy("version: 2\nstickers: []\n").problems).toEqual([
    { message: "study.yaml is version 2; this dek-study reads version 1", line: 1 },
  ]);
  expect(readStudy("version: 1\nstickers: {}\n").problems).toEqual([
    { message: "`stickers` is not a list", line: 2 },
  ]);
});

test("passes over a sticker it cannot use, and says why", () => {
  const source = `version: 1
stickers:
  - id: s1
    slide: a
  - id: s1
    slide: a
    quote: x
  - id: s1
    slide: a
    quote: y
`;
  const study = readStudy(source);
  expect(study.stickers.map((sticker) => sticker.quote)).toEqual(["x"]);
  expect(study.problems).toEqual([
    { message: "sticker s1 has no `quote`", line: 3 },
    { message: "sticker s1 is named twice; give each sticker its own id", line: 8 },
  ]);
});

test("an empty file has no stickers", () => {
  expect(readStudy("")).toEqual({ stickers: [], problems: [] });
});

test("names a field YAML reads as a number or a yes, and says to quote it", () => {
  const source = `version: 1
stickers:
  - id: year
    slide: meiji
    quote: 1868
  - id: 7
    slide: a
    quote: x
  - id: answer
    slide: a
    quote: true
  - id: kept
    slide: a
    quote: x
    prefix: 01
`;
  const study = readStudy(source);
  expect(study.stickers).toEqual([]);
  expect(study.problems).toEqual([
    {
      message: "sticker year: YAML reads its `quote` as the number 1868; put it in quotes",
      line: 3,
    },
    { message: "sticker #2: YAML reads its `id` as the number 7; put it in quotes", line: 6 },
    { message: "sticker answer: YAML reads its `quote` as true; put it in quotes", line: 9 },
    {
      message: "sticker kept: YAML reads its `prefix` as the number 1; put it in quotes",
      line: 12,
    },
  ]);
});
