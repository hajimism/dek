import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { attributeOf, decodeAttribute } from "../../src/core/attribute-value.ts";
import { LEGACY_REFERENCES, NAMED_REFERENCES } from "../../src/core/html-entities.ts";
import { ATTRIBUTE_VALUES } from "../helpers/attribute-values.ts";
import { propertyTest } from "../helpers/fc.ts";

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

/** Each named reference without its `;`, and what it stands for. */
const NAMED = new Map(
  NAMED_REFERENCES.split(" ").map((entry) => {
    const [name = "", points = ""] = entry.split(":");
    return [
      name,
      String.fromCodePoint(...points.split("+").map((point) => Number.parseInt(point, 16))),
    ];
  }),
);
const LEGACY = new Set(LEGACY_REFERENCES.split(" "));
/** The names that stand for each one character. */
const NAMES_OF = Map.groupBy(
  [...NAMED].filter(([, value]) => [...value].length === 1),
  ([, value]) => value,
);
/** The 0x80 to 0x9F a numeric reference reads as some other character. */
const C1_UNDEFINED = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d]);

/** How one character, or one named reference's characters, is written. */
type Form =
  | { kind: "itself" }
  /** An LF written as a CR or a CRLF, which the input stream reads as one. */
  | { kind: "cr"; crlf: boolean }
  /** `code` when the number written is not the character's own, as `&#128;` is not `€`'s. */
  | { kind: "decimal" | "hex"; zeros: number; upper: boolean; semicolon: boolean; code?: number }
  /** `legacy` says, for a name from the hand table, whether it may go without its `;`. */
  | { kind: "named"; name: string; semicolon: boolean; legacy?: boolean }
  /** Text written as it is, whatever follows it. */
  | { kind: "raw"; text: string };

type Written = { value: string; form: Form };

/** A character as the HTML a person writes holds it; never NUL, which no attribute can hold. */
const character = fc
  .oneof(
    fc.integer({ min: 0x01, max: 0x7f }),
    fc.integer({ min: 0x80, max: 0xff }),
    fc.constantFrom(...[...NAMES_OF.keys()].map((value) => value.codePointAt(0) ?? 0x41)),
    fc.integer({ min: 0x100, max: 0xd7ff }),
    fc.integer({ min: 0xe000, max: 0x10ffff }),
  )
  .map((code) => String.fromCodePoint(code));

/** Every way `value` may be written: as itself, as a numeric reference, as a name it has. */
function formsOf(value: string): fc.Arbitrary<Form> {
  const code = value.codePointAt(0) ?? 0;
  const numeric = !(code >= 0x80 && code <= 0x9f && !C1_UNDEFINED.has(code));
  const names = NAMES_OF.get(value) ?? [];
  return fc.oneof(
    // A CR is read as an LF, so one is written only by reference.
    ...(value === "\r" ? [] : [fc.constant<Form>({ kind: "itself" })]),
    ...(value === "\n" ? [fc.boolean().map((crlf): Form => ({ kind: "cr", crlf }))] : []),
    ...(numeric
      ? [
          fc
            .record({
              kind: fc.constantFrom("decimal" as const, "hex" as const),
              zeros: fc.nat(3),
              upper: fc.boolean(),
              semicolon: fc.boolean(),
            })
            .map((form): Form => form),
        ]
      : []),
    ...(names.length > 0
      ? [
          fc
            .record({
              name: fc.constantFrom(...names.map(([name]) => name)),
              semicolon: fc.boolean(),
            })
            .map(({ name, semicolon }): Form => ({ kind: "named", name, semicolon })),
        ]
      : []),
  );
}

/**
 * Named references and what they read as, legacy ones readable without their `;`: written out by
 * hand from the HTML standard, not read from html-entities.ts, so a wrong entry there, or in the
 * decoder's reading of it, cannot be the expectation too.
 */
const NAMED_BY_HAND: ReadonlyArray<readonly [name: string, value: string, legacy: boolean]> = [
  ["amp", "&", true],
  ["AMP", "&", true],
  ["lt", "<", true],
  ["gt", ">", true],
  ["quot", '"', true],
  ["nbsp", " ", true],
  ["eacute", "é", true],
  ["copy", "©", true],
  ["not", "¬", true],
  ["notin", "∉", false],
  ["hellip", "…", false],
  ["NotEqualTilde", "≂̸", false],
  ["fjlig", "fj", false],
];

/** Numbers a reference reads as some other character, by the standard's rules, written by hand. */
const NUMBERS_BY_HAND: ReadonlyArray<readonly [code: number, value: string]> = [
  // 0x80 to 0x9F read as Windows-1252, but for the five it leaves undefined.
  [0x80, "€"],
  [0x82, "‚"],
  [0x85, "…"],
  [0x8a, "Š"],
  [0x8e, "Ž"],
  [0x91, "‘"],
  [0x99, "™"],
  [0x9f, "Ÿ"],
  [0x81, "\u0081"],
  [0x8d, "\u008D"],
  [0x9d, "\u009D"],
  // NUL, a surrogate, and past Unicode read as U+FFFD.
  [0x0, "�"],
  [0xd800, "�"],
  [0xdbff, "�"],
  [0xdc00, "�"],
  [0xdfff, "�"],
  [0x110000, "�"],
  [0xffffff, "�"],
];

/** Text the decoder must leave as written, or read by the input stream's and tokenizer's rules. */
const RAW_BY_HAND: ReadonlyArray<readonly [text: string, value: string]> = [
  // A legacy name before `=`, or before a letter or digit, stays as written.
  ["&amp=", "&amp="],
  ["&copy=1", "&copy=1"],
  ["&ltin", "&ltin"],
  ["&notit", "&notit"],
  ["&#99999999999999999999;", "�"],
  ["\0", "�"],
];

/** The hard cases, each with what it reads as from the tables above. */
const byHand: fc.Arbitrary<Written> = fc.oneof(
  fc.tuple(fc.constantFrom(...NAMED_BY_HAND), fc.boolean()).map(
    ([[name, value, legacy], semicolon]): Written => ({
      value,
      form: { kind: "named", name, semicolon: semicolon || !legacy, legacy },
    }),
  ),
  fc
    .record({
      number: fc.constantFrom(...NUMBERS_BY_HAND),
      kind: fc.constantFrom("decimal" as const, "hex" as const),
      zeros: fc.nat(2),
      upper: fc.boolean(),
      semicolon: fc.boolean(),
    })
    .map(({ number: [code, value], ...form }): Written => ({ value, form: { ...form, code } })),
  fc
    .constantFrom(...RAW_BY_HAND)
    .map(([text, value]): Written => ({ value, form: { kind: "raw", text } })),
  // A lone CR, and a CRLF, read as one LF.
  fc.boolean().map((crlf): Written => ({ value: "\n", form: { kind: "cr", crlf } })),
);

/** A value, as the characters and named references it is made of, each with how it is written. */
const writtenValue: fc.Arbitrary<Written[]> = fc.array(
  fc.oneof(
    {
      weight: 6,
      arbitrary: character.chain((value) => formsOf(value).map((form) => ({ value, form }))),
    },
    { weight: 3, arbitrary: byHand },
    // A name that stands for more than one character, such as `&NotEqualTilde;` or `&fjlig;`.
    fc
      .constantFrom(...[...NAMED].filter(([, value]) => [...value].length > 1))
      .map(([name, value]): Written => ({ value, form: { kind: "named", name, semicolon: true } })),
  ),
  { maxLength: 12 },
);

/**
 * Each part written out, last first, so each knows what follows it: a reference keeps its `;`
 * when what follows would run on into it, and a literal `&` becomes `&amp;` before what would
 * make it a reference.
 */
function writeValue(parts: Written[]): Array<{ value: string; text: string; reference: boolean }> {
  const out: Array<{ value: string; text: string; reference: boolean }> = [];
  let next = "";
  for (const { value, form } of [...parts].reverse()) {
    const text = writeForm(value, form, next);
    out.unshift({ value, text, reference: text !== value });
    next = text[0] ?? "";
  }
  return out;
}

function writeForm(value: string, form: Form, next: string): string {
  const code =
    (form.kind === "decimal" || form.kind === "hex" ? form.code : undefined) ??
    value.codePointAt(0) ??
    0;
  switch (form.kind) {
    case "itself":
      return value === "&" && /[#A-Za-z0-9]/.test(next) ? "&amp;" : value;
    case "cr":
      return form.crlf || next === "\n" ? "\r\n" : "\r";
    case "decimal": {
      const digits = `${"0".repeat(form.zeros)}${code}`;
      return `&#${digits}${form.semicolon || /[0-9;]/.test(next) ? ";" : ""}`;
    }
    case "hex": {
      const digits = `${"0".repeat(form.zeros)}${code.toString(16)}`;
      const x = form.upper ? "X" : "x";
      const hex = form.upper ? digits.toUpperCase() : digits;
      return `&#${x}${hex}${form.semicolon || /[0-9a-fA-F;]/.test(next) ? ";" : ""}`;
    }
    case "named": {
      const legacy = form.legacy ?? LEGACY.has(form.name);
      return `&${form.name}${form.semicolon || !legacy || /[A-Za-z0-9=;]/.test(next) ? ";" : ""}`;
    }
    case "raw":
      return form.text;
  }
}

describe("decodeAttribute over generated values", () => {
  // However each character is written, as itself, by number, or by a name it has, decoding the
  // value as written gives back the value.
  propertyTest(
    "reads back the value, however each character is written",
    fc.property(writtenValue, (parts) => {
      const written = writeValue(parts);
      expect(decodeAttribute(written.map((part) => part.text).join("")).value).toBe(
        written.map((part) => part.value).join(""),
      );
    }),
  );

  // writtenAt runs from 0 to the end of what was written, never back, and maps each unit a
  // reference stands for to where the reference starts, and each unit written as itself to itself.
  propertyTest(
    "maps each unit into the text that wrote it",
    fc.property(writtenValue, (parts) => {
      const written = writeValue(parts);
      const text = written.map((part) => part.text).join("");
      const decoded = decodeAttribute(text);
      const at = [...Array(decoded.value.length + 1).keys()].map(decoded.writtenAt);
      expect(at[0]).toBe(0);
      expect(at.at(-1)).toBe(text.length);
      expect(at.every((offset, index) => index === 0 || offset >= (at[index - 1] ?? 0))).toBe(true);
      const expected: number[] = [];
      let from = 0;
      for (const part of written) {
        for (let unit = 0; unit < part.value.length; unit++) {
          expected.push(part.reference ? from : from + unit);
        }
        from += part.text.length;
      }
      expect(at.slice(0, -1)).toEqual(expected);
    }),
  );

  propertyTest(
    "reads back the value through HTMLRewriter, as attributeOf does",
    fc.property(writtenValue, (parts) => {
      // Between double quotes, a `"` is written only by reference.
      const written = writeValue(
        parts.map((part) =>
          part.value === '"' && part.form.kind === "itself"
            ? { ...part, form: { kind: "named", name: "quot", semicolon: true } }
            : part,
        ),
      );
      const read: Array<string | null> = [];
      new HTMLRewriter()
        .on("img", {
          element(el) {
            read.push(attributeOf(el, "alt"));
          },
        })
        .transform(`<img alt="${written.map((part) => part.text).join("")}">`);
      expect(read).toEqual([written.map((part) => part.value).join("")]);
    }),
  );
});
