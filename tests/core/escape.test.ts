import { describe, expect, test } from "bun:test";
import { shellName, shellQuote } from "../../src/core/escape.ts";
import { AWKWARD_NAMES, shellWordsOf, UNWRITABLE_NAMES } from "../helpers/shell.ts";

describe("shellQuote", () => {
  test("leaves a word no shell reads anything in as it is, in any script", () => {
    for (const word of ["2026-10-talk", "講演", "file/why-dek", "packs/a.tgz", "o/r/d@v1.2"]) {
      expect(shellQuote(word)).toBe(word);
    }
  });

  test("makes any other word one word that a shell reads back exactly", () => {
    const words = [...AWKWARD_NAMES, ...UNWRITABLE_NAMES, "", "`", "``", "=ls", "~", "*", '"', "'"];
    const read = shellWordsOf(words.map((word) => `dekc ${shellQuote(word)}`));
    expect(read).toEqual(words.map((word) => ["dekc", word]));
  });

  test("quotes a word zsh would read as a program's path", () => {
    expect(shellQuote("=ls")).not.toBe("=ls");
    expect(shellQuote("a=b")).toBe("a=b");
  });

  test("never writes a backtick, which would close the code span a hint holds it in", () => {
    for (const word of ["a`b", "`", "x`;echo$IFS'hi'|sh;`"]) {
      expect(shellQuote(word)).not.toContain("`");
    }
  });
});

describe("shellName", () => {
  test("is the word shellQuote writes for a name every shell reads alike", () => {
    for (const name of [...AWKWARD_NAMES, "講演", "demo"]) {
      expect(shellName(name)).toBe(shellQuote(name));
    }
  });

  test("is nothing for a name with a quote, a backslash, or a control character", () => {
    for (const name of [...UNWRITABLE_NAMES, "a\u0007b", "a\u009bb"]) {
      expect(shellName(name)).toBeUndefined();
    }
  });
});
