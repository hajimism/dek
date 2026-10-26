import { describe, expect, test } from "bun:test";
import { findLineBreaks, type TextFlow } from "../../src/core/line-break.ts";

/** A flow from its lines as written, each after the first soft unless it starts with "\n". */
function flow(lines: string[], extra: Partial<TextFlow> = {}): TextFlow {
  let text = "";
  const starts: TextFlow["lines"] = [];
  for (const line of lines) {
    const forced = line.startsWith("\n");
    if (forced) {
      text += "\n";
    }
    starts.push({ start: text.length, forced: starts.length > 0 && forced });
    text += forced ? line.slice(1) : line;
  }
  return { element: 0, text, lines: starts, ...extra };
}

describe("findLineBreaks", () => {
  test("finds nothing in text that fits on one line", () => {
    expect(findLineBreaks([flow(["一行に収まる"])])).toEqual([]);
  });

  test("finds a line broken inside a phrase, with the lines it would have phrase by phrase", () => {
    const broken = flow(["AIはここが苦", "手です"]);
    expect(findLineBreaks([{ ...broken, phrased: [0, 6] }])).toEqual([
      {
        element: 0,
        kind: "split",
        lines: ["AIはここが苦", "手です"],
        phrased: ["AIはここが", "苦手です"],
      },
    ]);
  });

  test("finds a paragraph whose last line holds two letters or fewer", () => {
    expect(findLineBreaks([flow(["説明はこれで終わりま", "す。"])])).toEqual([
      { element: 0, kind: "short", lines: ["説明はこれで終わりま", "す。"], tail: "す。" },
    ]);
    expect(findLineBreaks([flow(["Read the slide and then ask the", "AI"])])).toEqual([
      expect.objectContaining({ kind: "short", tail: "AI" }),
    ]);
  });

  test("leaves a last line of three letters or more alone", () => {
    expect(findLineBreaks([flow(["説明はこれで終わ", "ります。"])])).toEqual([]);
    expect(findLineBreaks([flow(["Read the slide and then ask", "the AI"])])).toEqual([]);
  });

  test("leaves a short line a <br> put there alone: the author chose it", () => {
    expect(findLineBreaks([flow(["ここで", "\n切る"])])).toEqual([]);
  });

  test("judges each paragraph a <br> or a block ends by its own last line", () => {
    const found = findLineBreaks([flow(["最初の段落が折り返", "す", "\n次の段落"])]);
    expect(found).toEqual([
      {
        element: 0,
        kind: "short",
        lines: ["最初の段落が折り返", "す", "次の段落"],
        tail: "す",
      },
    ]);
  });

  test("reads lines as the audience sees them, the markup's white space collapsed", () => {
    const text = "\n    Read the slide and\n    then ask the\n    AI\n  ";
    const found = findLineBreaks([
      {
        element: 3,
        text,
        lines: [
          { start: text.indexOf("Read"), forced: false },
          { start: text.indexOf("AI"), forced: false },
        ],
      },
    ]);
    expect(found).toEqual([
      {
        element: 3,
        kind: "short",
        lines: ["Read the slide and then ask the", "AI"],
        tail: "AI",
      },
    ]);
  });

  test("reports only the broken phrase in a text that also ends short: phrase by phrase, every line after it moves", () => {
    const both = flow(["説明はこれで終わりま", "す"]);
    expect(findLineBreaks([{ ...both, phrased: [0, 6] }]).map((found) => found.kind)).toEqual([
      "split",
    ]);
  });

  test("judges each text apart", () => {
    const found = findLineBreaks([
      flow(["一行"], { element: 1 }),
      flow(["説明はこれで終わりま", "す"], { element: 2 }),
    ]);
    expect(found.map(({ kind, element }) => `${kind} ${element}`)).toEqual(["short 2"]);
  });
});
