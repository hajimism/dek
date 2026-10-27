import { describe, expect, test } from "bun:test";
import { foreignLine, foreignList } from "../../src/core/foreign-text.ts";

describe("foreignLine", () => {
  test("leaves a plain line as it is", () => {
    expect(foreignLine("Why dek", 80)).toBe("Why dek");
    expect(foreignLine("なぜ dek なのか", 80)).toBe("なぜ dek なのか");
  });

  test("puts line breaks, tabs, and controls on one line as single spaces", () => {
    expect(foreignLine("  a\n\n## b\t\x1b[8mc\r\n", 80)).toBe("a ## b [8mc");
  });

  test("shows each character a person cannot see by its code point", () => {
    const hidden = "a\u{200B}b\u{FEFF}c\u{202E}d\u{2066}e\u{2028}f\u{E0041}g\u{200E}";
    expect(foreignLine(hidden, 200)).toBe(
      "a⟨U+200B⟩b⟨U+FEFF⟩c⟨U+202E⟩d⟨U+2066⟩e⟨U+2028⟩f⟨U+E0041⟩g⟨U+200E⟩",
    );
  });

  test("shows the rest of what Unicode marks default-ignorable, but no variation selector", () => {
    // A soft hyphen, a Hangul filler that shows blank, a Mongolian vowel separator, an invisible
    // function application, an unassigned tag, and an interlinear annotation anchor.
    const hidden = "a\u{AD}b\u{3164}c\u{180E}d\u{2061}e\u{E0080}f\u{FFF9}g";
    expect(foreignLine(hidden, 200)).toBe(
      "a⟨U+00AD⟩b⟨U+3164⟩c⟨U+180E⟩d⟨U+2061⟩e⟨U+E0080⟩f⟨U+FFF9⟩g",
    );
    // An emoji's, a kanji's ideographic variant, and a Mongolian free variation selector.
    const variants = "\u{2764}\u{FE0F} \u{845B}\u{E0100} \u{1820}\u{180B}";
    expect(foreignLine(variants, 80)).toBe(variants);
  });

  test("cuts at the limit with an ellipsis, never through a marker", () => {
    expect(foreignLine("abcdefghij", 5)).toBe("abcd…");
    expect(foreignLine("abc\u{E0041}defgh", 10)).toBe("abc…");
    expect([...foreignLine("x".repeat(100), 80)]).toHaveLength(80);
  });
});

describe("foreignList", () => {
  test("joins the names, each cut to 40 characters, and counts what it leaves out", () => {
    expect(foreignList(["a", "b"])).toBe("a, b");
    expect(foreignList(["y".repeat(50)])).toBe(`${"y".repeat(39)}…`);
    const names = Array.from({ length: 13 }, (_, i) => `n${i}`);
    expect(foreignList(names)).toBe("n0, n1, n2, n3, n4, n5, n6, n7, n8, n9, and 3 more");
  });
});
