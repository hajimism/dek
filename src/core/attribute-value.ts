/**
 * An attribute's value as the browser reads it. Bun's HTMLRewriter gives each value as written,
 * character references and all, so `assets/Q&amp;A.png` would name a file the page never loads.
 * Every value lint or the build reads off the rewriter goes through here first; a value written
 * back into the markup is written from the one as written, never from this.
 */
import { LEGACY_REFERENCES, NAMED_REFERENCES } from "./html-entities.ts";

/** A decoded value, and where in the value as written each of its UTF-16 units comes from. */
export type DecodedAttribute = {
  value: string;
  /** The offset in the written value of the unit at `index`; `value.length` maps past the end. */
  writtenAt(index: number): number;
};

/** The value of `name` on a rewriter's element as the browser reads it, or null when absent. */
export function attributeOf(
  element: { getAttribute(name: string): string | null },
  name: string,
): string | null {
  const written = element.getAttribute(name);
  return written === null ? null : decodeAttribute(written).value;
}

/**
 * Whether `char` is ASCII whitespace, the only whitespace HTML splits a list of tokens on or trims
 * a value of. A no-break space, written as itself or as `&nbsp;`, is part of the value.
 */
export function isAsciiWhitespace(char: string | undefined): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\f" || char === "\r";
}

/** The tokens of a value such as `class` or `role`, split on ASCII whitespace as HTML splits it. */
export function attributeTokens(value: string | null | undefined): string[] {
  return (value ?? "").split(/[\t\n\f\r ]+/).filter(Boolean);
}

/** `value` without the ASCII whitespace at its ends, as HTML trims a keyword or a name. */
export function trimAsciiWhitespace(value: string): string {
  return value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "");
}

/**
 * `written` read the way the HTML standard reads an attribute value: every numeric and named
 * character reference decoded, a carriage return read as a line feed, and a NUL as U+FFFD. A
 * name the standard allows without its `;` stays as written when a letter, a digit, or `=`
 * follows it, so the `&copy` of `?a=1&copy=2` is left alone, as the browser leaves it.
 */
export function decodeAttribute(written: string): DecodedAttribute {
  // Each replacement, where it is in the decoded value and where in the written one, in order.
  const spans: Array<{ start: number; end: number; writtenStart: number; writtenEnd: number }> = [];
  let shift = 0;
  const value = written.replace(
    REFERENCE_RE,
    (match: string, hex?: string, decimal?: string, name?: string, semicolon?: string, at = 0) => {
      const text = replacement(written, match, at, { hex, decimal, name, semicolon });
      if (text !== match) {
        const start = at - shift;
        spans.push({
          start,
          end: start + text.length,
          writtenStart: at,
          writtenEnd: at + match.length,
        });
        shift += match.length - text.length;
      }
      return text;
    },
  );
  return {
    value,
    writtenAt(index) {
      let offset = index;
      for (const span of spans) {
        if (index < span.start) {
          break;
        }
        if (index < span.end) {
          return span.writtenStart;
        }
        offset = span.writtenEnd + (index - span.end);
      }
      return offset;
    },
  };
}

/**
 * A character reference, with its parts as groups; a carriage return, which the input stream reads
 * as a line feed; or a NUL, which the tokenizer reads as U+FFFD in a value.
 */
const REFERENCE_RE = /&(?:#(?:[xX]([0-9a-fA-F]+)|([0-9]+));?|([A-Za-z0-9]+)(;?))|\r\n?|\0/g;

/** What one match of REFERENCE_RE reads as: itself, when the standard leaves it as written. */
function replacement(
  written: string,
  match: string,
  at: number,
  parts: { hex?: string; decimal?: string; name?: string; semicolon?: string },
): string {
  if (match === "\0") {
    return "\uFFFD";
  }
  if (match.startsWith("\r")) {
    return "\n";
  }
  if (parts.hex !== undefined || parts.decimal !== undefined) {
    return numericReference(
      parts.hex === undefined
        ? Number.parseInt(parts.decimal ?? "", 10)
        : Number.parseInt(parts.hex, 16),
    );
  }
  const name = parts.name ?? "";
  if (parts.semicolon) {
    return namedReferences().get(name) ?? match;
  }
  // The browser takes the longest name it knows. A legacy name shorter than the run of letters
  // and digits is followed by one of them, which keeps it as written, so only the whole run can.
  if (legacyReferences().has(name) && written[at + match.length] !== "=") {
    return namedReferences().get(name) ?? match;
  }
  return match;
}

/**
 * The character a numeric reference stands for: U+FFFD for NUL, a surrogate, or a number past
 * Unicode, and for 0x80 to 0x9F the Windows-1252 character the standard reads it as.
 */
function numericReference(number: number): string {
  if (number === 0 || number > 0x10ffff || (number >= 0xd800 && number <= 0xdfff)) {
    return "\uFFFD";
  }
  return String.fromCodePoint(C1_REPLACEMENTS.get(number) ?? number);
}

/** The HTML standard's table for a numeric reference to a C1 control. */
const C1_REPLACEMENTS: ReadonlyMap<number, number> = new Map([
  [0x80, 0x20ac],
  [0x82, 0x201a],
  [0x83, 0x0192],
  [0x84, 0x201e],
  [0x85, 0x2026],
  [0x86, 0x2020],
  [0x87, 0x2021],
  [0x88, 0x02c6],
  [0x89, 0x2030],
  [0x8a, 0x0160],
  [0x8b, 0x2039],
  [0x8c, 0x0152],
  [0x8e, 0x017d],
  [0x91, 0x2018],
  [0x92, 0x2019],
  [0x93, 0x201c],
  [0x94, 0x201d],
  [0x95, 0x2022],
  [0x96, 0x2013],
  [0x97, 0x2014],
  [0x98, 0x02dc],
  [0x99, 0x2122],
  [0x9a, 0x0161],
  [0x9b, 0x203a],
  [0x9c, 0x0153],
  [0x9e, 0x017e],
  [0x9f, 0x0178],
]);

let named: Map<string, string> | undefined;
let legacy: Set<string> | undefined;

/** Each named reference, without its `;`, and the characters it stands for; read once. */
function namedReferences(): Map<string, string> {
  named ??= new Map(
    NAMED_REFERENCES.split(" ").map((entry) => {
      const [name = "", points = ""] = entry.split(":");
      return [
        name,
        String.fromCodePoint(...points.split("+").map((point) => Number.parseInt(point, 16))),
      ];
    }),
  );
  return named;
}

function legacyReferences(): Set<string> {
  legacy ??= new Set(LEGACY_REFERENCES.split(" "));
  return legacy;
}
