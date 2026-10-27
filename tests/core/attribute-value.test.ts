import { describe, expect, test } from "bun:test";
import { attributeOf, decodeAttribute } from "../../src/core/attribute-value.ts";
import { ATTRIBUTE_VALUES } from "../helpers/attribute-values.ts";

describe("decodeAttribute", () => {
  test.each(ATTRIBUTE_VALUES.map(([written, read]) => [JSON.stringify(written), written, read]))(
    "reads %s as the browser does",
    (_, written, read) => {
      expect(decodeAttribute(written).value).toBe(read);
    },
  );

  test("says where in the written value each unit of the decoded one is", () => {
    const decoded = decodeAttribute("a&#32;b&amp;c\r\nd");
    expect(decoded.value).toBe("a b&c\nd");
    expect([...Array(decoded.value.length + 1).keys()].map(decoded.writtenAt)).toEqual([
      0, 1, 6, 7, 12, 13, 15, 16,
    ]);
  });

  test("maps every unit a reference stands for to where the reference starts", () => {
    const decoded = decodeAttribute("x&#x1F600;&NotEqualTilde;y");
    expect(decoded.value).toBe("x\u{1F600}\u2242\u0338y");
    expect([...Array(decoded.value.length + 1).keys()].map(decoded.writtenAt)).toEqual([
      0, 1, 1, 10, 10, 25, 26,
    ]);
  });

  test("maps a value with nothing to decode onto itself", () => {
    const decoded = decodeAttribute("assets/a.png 2x");
    expect(decoded.value).toBe("assets/a.png 2x");
    expect(decoded.writtenAt(7)).toBe(7);
    expect(decoded.writtenAt(15)).toBe(15);
  });
});

describe("attributeOf", () => {
  test("reads a rewriter's attribute as the browser does, and none that is absent", () => {
    const read: Array<string | null> = [];
    new HTMLRewriter()
      .on("img", {
        element(el) {
          read.push(attributeOf(el, "src"), attributeOf(el, "alt"));
        },
      })
      .transform(`<img src="assets/Q&amp;A.png">`);
    expect(read).toEqual(["assets/Q&A.png", null]);
  });
});
