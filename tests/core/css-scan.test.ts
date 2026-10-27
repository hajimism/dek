import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
  blankStringsAndComments,
  consumeString,
  matchBrace,
  splitTopLevel,
  stripComments,
} from "../../src/core/css-scan.ts";
import { propertyTest } from "../helpers/fc.ts";
import { paddings, sheetPlan, writeSheet } from "../helpers/stylesheets.ts";

/** Where the block opening at the first `{` closes, as an index into `css`. */
const closeOfFirst = (css: string) => matchBrace(css, css.indexOf("{"));

describe("a string ends where CSS ends it", () => {
  test("at a newline, CR and FF included, without taking it", () => {
    for (const newline of ["\n", "\r", "\f", "\r\n"]) {
      const css = `"x${newline}y"`;
      expect(consumeString(css, 0)).toBe(2);
    }
  });

  test("not at a newline a backslash escapes, CRLF included", () => {
    for (const newline of ["\n", "\r", "\f", "\r\n"]) {
      const css = `"x\\${newline}y" z`;
      expect(consumeString(css, 0)).toBe(css.indexOf(" z"));
    }
  });

  test("not at the one whitespace a hex escape takes, a newline included", () => {
    for (const space of [" ", "\n", "\r\n"]) {
      const css = `"\\41${space}y" z`;
      expect(consumeString(css, 0)).toBe(css.indexOf(" z"));
    }
  });

  test("at the quote that opened it, not at an escaped one or the other kind", () => {
    const css = `"a\\"b'c" z`;
    expect(consumeString(css, 0)).toBe(css.indexOf(" z"));
  });
});

describe("matchBrace closes a block where Chromium does", () => {
  test.each([
    ["a string cut short by CR", 'a{content:"x\r} b{color:red}'],
    ["a string cut short by FF", 'a{content:"x\f} b{color:red}'],
    ["a string cut short by CRLF", 'a{content:"x\r\n} b{color:red}'],
    ["an unquoted url() holding /*", "a{background:url(https://e.x/*.png)} b{color:red}"],
    ["an unquoted url() holding a quote", "a{background:url(foo'bar)} b{color:red}"],
  ])("after %s", (_, css) => {
    expect(closeOfFirst(css)).toBe(css.indexOf("}"));
  });

  test("past a brace an escaped newline keeps in the string", () => {
    const css = 'a{content:"x\\\r\n} b{color:red}"} c{color:red}';
    expect(closeOfFirst(css)).toBe(css.indexOf('"}') + 1);
  });

  test("past a brace a hex escape's newline keeps in the string", () => {
    const css = 'a{content:"\\41\n} b{color:red}"} c{color:red}';
    expect(closeOfFirst(css)).toBe(css.indexOf('"}') + 1);
  });
});

describe("matchBrace over generated stylesheets", () => {
  // Every `{` is closed by the `}` written for it, or by the end of a sheet left open, whatever
  // strings, comments, url()s, escapes, and padding lie between them.
  propertyTest(
    "closes every block where it was closed",
    fc.property(sheetPlan, paddings, (plan, padding) => {
      const { css, blocks } = writeSheet(plan, padding);
      expect(blocks.map((block) => matchBrace(css, block.open))).toEqual(
        blocks.map((block) => block.close),
      );
    }),
  );
});

describe("an unquoted url() is one token", () => {
  test.each([
    ["spaces around the address", "a{b:url(  x/*y  )} c{}"],
    ["an escaped )", "a{b:url(x\\)/*)} c{}"],
    ["the name in capitals", "a{b:URL(x/*y)} c{}"],
    ["the name written with an escape", "a{b:u\\72l(x/*y)} c{}"],
    ["a number before it, cut off by a dot", "a{b:1.url(x/*y)} c{}"],
    ["no ) before the end of the block", "a{b:url(x/*y"],
  ])("with %s", (_, css) => {
    expect(closeOfFirst(css)).toBe(css.includes("c{") ? css.indexOf("} c") : css.length);
  });

  test.each([
    ["a space inside the address", "a{b:url(x y/*)} c{}"],
    ["a ( inside the address", "a{b:url(x(y/*)} c{}"],
    ["a quote inside the address", "a{b:url(x'y/*)} c{}"],
    ["a control character", "a{b:url(x\u0001/*)} c{}"],
    ["a backslash before a newline", "a{b:url(x\\\n/*)} c{}"],
  ])("broken by %s, it still ends at the )", (_, css) => {
    expect(closeOfFirst(css)).toBe(css.indexOf("} c"));
  });

  test("but url( and a quoted address is a function holding a string", () => {
    const css = 'a{b:url( "x/*y" ) /* z } */} c{}';
    expect(closeOfFirst(css)).toBe(css.indexOf("} c"));
    expect(stripComments(css)).toBe('a{b:url( "x/*y" ) } c{}');
  });

  test.each([
    ["a longer name", "a{b:myurl(x/*y)} c{} */ d{}"],
    ["a vendor prefix", "a{b:-webkit-url(x/*y)} c{} */ d{}"],
    ["a hash", "a{b:#url(x/*y)} c{} */ d{}"],
    ["a number's unit", "a{b:10url(x/*y)} c{} */ d{}"],
    ["a name that starts with NUL, which CSS reads as U+FFFD", "a{b:\u0000url(x/*y)} c{} */ d{}"],
  ])("but not inside %s, where /* opens a comment", (_, css) => {
    expect(closeOfFirst(css)).toBe(css.length);
  });

  test("stripComments and blankStringsAndComments leave it as written", () => {
    const css = "a{b:url(x/*y'z)}/* c */";
    expect(stripComments(css)).toBe("a{b:url(x/*y'z)}");
    expect(blankStringsAndComments(css)).toBe(`a{b:url(x/*y'z)}${" ".repeat(7)}`);
  });

  test("splitTopLevel does not split inside it", () => {
    expect(splitTopLevel("url(a'b,c), d")).toEqual(["url(a'b,c)", " d"]);
  });
});

describe("blankStringsAndComments", () => {
  test("keeps every newline, CR and FF included, so offsets and lines stay put", () => {
    expect(blankStringsAndComments('a/* x\r\ny\f */"z\\\r\n"b')).toBe(
      `a${" ".repeat(4)}\r\n \f${" ".repeat(6)}\r\n b`,
    );
  });
});
