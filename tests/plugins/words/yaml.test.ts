import { describe, expect, test } from "bun:test";
import { parseYaml, YamlError } from "../../../src/plugins/words/yaml.ts";

const files = [
  "",
  "# only a comment\n",
  "version: 1\nstickers: []\n",
  `version: 1
stickers:
  - id: s1           # a comment
    slide: planning-fallacy
    quote: 外部視点
    prefix: "楽観的に: 見積もる"
  - id: 's2'
    slide: intro
    quote: 'it''s # not a comment'
`,
  `version: 1
stickers:
- id: s1
  slide: a
  quote: "tab\\there \\u5916"
`,
  "version: 1\nstickers:\n  -\n    id: s1\n    slide: a\n    quote: b\n",
  "a: true\nb: null\nc: ~\nd: -3\ne: {}\n",
  // Notepad on Windows saves UTF-8 with a byte order mark.
  "\uFEFFversion: 1\nstickers: []\n",
  // A quote inside a plain value starts nothing, so the comment after it is still a comment.
  "quote: don't stop  # the answer\nprefix: rock'n'roll # c\nslide: 'x' # d\n",
];

describe("parseYaml", () => {
  test("reads the YAML words.yaml is written in as Bun's YAML does", () => {
    for (const source of files) {
      expect({ source, value: parseYaml(source).value }).toEqual({
        source,
        value: Bun.YAML.parse(source) ?? null,
      });
    }
  });

  test("gives the line each mapping starts on", () => {
    const { value, lineOf } = parseYaml(files[3] as string);
    const stickers = (value as { stickers: object[] }).stickers;
    expect(stickers.map((sticker) => lineOf(sticker))).toEqual([3, 7]);
  });

  test("refuses YAML it does not read, with the line", () => {
    const cases: Array<[string, number]> = [
      ["stickers: [", 1],
      ["a: 1\n  b: 2\n", 2],
      ["a: |\n  text\n", 1],
      ["a: &x 1\n", 1],
      ["a: 1\na: 2\n", 2],
      ["\ta: 1\n", 1],
      ["just text\n", 1],
      ['a: "open\n', 1],
    ];
    for (const [source, line] of cases) {
      let thrown: unknown;
      try {
        parseYaml(source);
      } catch (error) {
        thrown = error;
      }
      expect({
        source,
        error: thrown instanceof YamlError,
        line: (thrown as YamlError)?.line,
      }).toEqual({
        source,
        error: true,
        line,
      });
    }
  });
});
