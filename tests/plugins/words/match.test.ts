import { describe, expect, test } from "bun:test";
import type { Entry } from "../../../src/plugins/words/list.ts";
import { finder } from "../../../src/plugins/words/match.ts";

const entry = (fields: Partial<Entry> & { word: string }): Entry => ({
  except: [],
  line: 1,
  ...fields,
});
const found = (fields: Partial<Entry> & { word: string }, text: string) =>
  finder(entry(fields))(text).map(({ index, text: what }) => [index, what]);

describe("finder", () => {
  test("finds a word as written, each place it is", () => {
    expect(found({ word: "解像度" }, "解像度を上げ、解像度で見る")).toEqual([
      [0, "解像度"],
      [7, "解像度"],
    ]);
  });

  test("finds a word in a script with spaces as whole words, with case ignored", () => {
    expect(found({ word: "leverage" }, "We Leverage it, leveraged or not")).toEqual([
      [3, "Leverage"],
    ]);
    expect(found({ word: "AI" }, "AIで作る。RAID は別")).toEqual([[0, "AI"]]);
  });

  test("finds a godan verb in each of its forms, and nothing else that starts the same", () => {
    const text = "効かない、効きます、効く、効けば、効こう、効いている。効果と効率";
    expect(found({ word: "効く", verb: "godan" }, text).map(([, what]) => what)).toEqual([
      "効か",
      "効き",
      "効く",
      "効け",
      "効こ",
      "効い",
    ]);
    expect(found({ word: "待つ", verb: "godan" }, "待って")).toEqual([[0, "待っ"]]);
    expect(found({ word: "読む", verb: "godan" }, "読んだ")).toEqual([[0, "読ん"]]);
    expect(found({ word: "拾う", verb: "godan" }, "拾った、拾わない")).toEqual([
      [0, "拾っ"],
      [4, "拾わ"],
    ]);
  });

  test("finds an ichidan verb by its stem", () => {
    expect(found({ word: "落ちる", verb: "ichidan" }, "落ちた")).toEqual([[0, "落ち"]]);
  });

  test("passes over a place inside a word the entry excepts", () => {
    const text = "突き抜ける。弱点を突かれ、突き止めた";
    expect(found({ word: "突く", verb: "godan", except: ["突き抜ける"] }, text)).toEqual([
      [9, "突か"],
      [13, "突き"],
    ]);
  });

  test("looks for a pattern instead of the word", () => {
    expect(found({ word: "〜した瞬間", pattern: "た瞬間" }, "決めた瞬間に")).toEqual([
      [2, "た瞬間"],
    ]);
  });
});
