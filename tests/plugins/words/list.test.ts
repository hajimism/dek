import { describe, expect, test } from "bun:test";
import { readAllows, readList } from "../../../src/plugins/words/list.ts";

const LIST = "plugins/words/words.yaml";

describe("readList", () => {
  test("reads each entry with the line it starts on", () => {
    const { entries, problems } = readList(
      [
        "version: 1",
        "words:",
        "  - word: 解像度",
        "    use: 何がどこまで分かっているかを書く",
        "  - word: 〜した瞬間",
        "    pattern: た瞬間",
        "  - word: 突く",
        "    verb: godan",
        "    except:",
        "      - 突き抜ける",
        "  - word: 〇〇",
        "    in: slides",
      ].join("\n"),
    );
    expect(problems).toEqual([]);
    expect(entries).toEqual([
      { word: "解像度", use: "何がどこまで分かっているかを書く", except: [], line: 3 },
      { word: "〜した瞬間", pattern: "た瞬間", except: [], line: 5 },
      { word: "突く", verb: "godan", except: ["突き抜ける"], line: 7 },
      { word: "〇〇", in: "slides", except: [], line: 11 },
    ]);
  });

  test("has nothing to check in an empty list", () => {
    expect(readList("")).toEqual({ entries: [], problems: [] });
    expect(readList("version: 1\n")).toEqual({ entries: [], problems: [] });
  });

  test("refuses a list that is not YAML it reads, or of another version", () => {
    const [notYaml] = readList("words: [a, b]\n").problems;
    expect(notYaml?.message).toContain(`${LIST} is not YAML dek-words reads`);
    const [version] = readList("version: 2\nwords: []\n").problems;
    expect(version).toEqual({
      message: `${LIST} is version 2; this dek-words reads version 1`,
      line: 1,
    });
  });

  test("leaves out an entry it cannot use, says why at its line, and reads the rest", () => {
    const { entries, problems } = readList(
      [
        "version: 1",
        "words:",
        "  - use: 使う",
        "  - word: 効く",
        "    excepts:",
        "      - 効き目",
        "  - word: 1868",
        "  - word: 刺さる",
        "    verb: godan",
        "    pattern: 刺さ",
        "  - word: 落ちる",
        "    verb: five",
        "  - word: 解像度",
        "    verb: godan",
        "  - word: 見せる",
        "    verb: ichidan",
        "  - word: 土台",
        "    pattern: '('",
        "  - word: 入口",
        "    pattern: 'x*'",
        "  - word: 本丸",
        "    in: notes",
        "  - word: 見せる",
        "  - word: 盤石",
      ].join("\n"),
    );
    expect(entries.map((entry) => entry.word)).toEqual(["見せる", "盤石"]);
    expect(problems.map(({ line }) => line)).toEqual([3, 4, 7, 8, 11, 13, 17, 19, 21, 23]);
    expect(problems.map(({ message }) => message)).toEqual([
      "entry #1 has no `word`",
      "entry 効く has `excepts`, which the list does not take",
      "entry #3: YAML reads its `word` as the number 1868; put it in quotes",
      "entry 刺さる has both `verb` and `pattern`; keep one",
      "entry 落ちる: `verb` is godan or ichidan, not five",
      "entry 解像度: a godan verb ends in う, く, ぐ, す, つ, ぬ, ぶ, む, or る",
      "entry 土台: `pattern` is not a regular expression: (",
      "entry 入口: `pattern` matches where there is no text",
      "entry 本丸: `in` is slides or script, not notes",
      "entry 見せる is on the list twice; keep one",
    ]);
  });

  test("an ichidan verb ends in る", () => {
    const [problem] = readList("version: 1\nwords:\n  - word: 見た\n    verb: ichidan\n").problems;
    expect(problem?.message).toBe("entry 見た: an ichidan verb ends in る");
  });

  test("an ichidan verb is not found by a stem of one letter, which 意見 and 見解 hold too", () => {
    const { entries, problems } = readList(
      "version: 1\nwords:\n  - word: 見る\n    verb: ichidan\n  - word: 𠮟る\n    verb: godan\n",
    );
    expect(problems.map(({ message }) => message)).toEqual([
      "entry 見る: its stem 見 is one letter, which too many words hold; write a `pattern` for its forms",
    ]);
    expect(entries.map(({ word }) => word)).toEqual(["𠮟る"]);
  });
});

describe("readAllows", () => {
  const listed = new Set(["物差し", "効く"]);

  test("reads the words a deck allows", () => {
    expect(readAllows("version: 1\nallow:\n  - 物差し   # the talk's subject\n", listed)).toEqual({
      allows: new Set(["物差し"]),
      problems: [],
    });
  });

  test("refuses an allow that names no entry, at its line", () => {
    expect(readAllows("version: 1\nallow:\n  - 効く\n  - 物指し\n", listed)).toEqual({
      allows: new Set(["効く"]),
      problems: [
        {
          message: "words.yaml allows 物指し, which is no entry on plugins/words/words.yaml",
          line: 4,
        },
      ],
    });
  });

  test("refuses a key it does not take, and a version it does not read", () => {
    expect(readAllows("version: 1\nallows:\n  - 効く\n", listed).problems).toEqual([
      { message: "words.yaml has `allows`, which it does not take; write `allow`", line: 2 },
    ]);
    expect(readAllows("version: 3\n", listed).problems[0]?.message).toBe(
      "words.yaml is version 3; this dek-words reads version 1",
    );
  });
});
