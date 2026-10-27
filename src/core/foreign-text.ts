/**
 * Text someone else wrote, such as a ref's title or the folder names in its repository, as dek
 * puts it inside its own words. An agent reads dek's messages and AGENTS.md's dek block as dek's,
 * so such text must not start a line there, carry a control character, or hold a character the
 * person reading never sees.
 */

/**
 * Characters that show as nothing or move the text around them: those Unicode marks
 * default-ignorable, such as zero-width ones, the byte order mark, bidi controls, Hangul fillers,
 * and tag characters, which a model reads as text though a person sees nothing; and the line and
 * paragraph separators and the interlinear annotation marks. The variation selectors, Mongolian's
 * free ones included, are default-ignorable too and left out: emoji, ideographic variants of a
 * kanji, and Mongolian text use them on purpose.
 */
const HIDDEN_RE =
  /(?![\u{fe00}-\u{fe0f}\u{e0100}-\u{e01ef}\u{180b}-\u{180d}\u{180f}])[\p{Default_Ignorable_Code_Point}\u{2028}\u{2029}\u{fff9}-\u{fffb}]/u;

/** Whitespace and control characters, which a line of someone else's text shows as one space. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point.
const SPACE_RE = /[\s\x00-\x1f\x7f-\x9f]/u;

/** HIDDEN_RE for every match. */
const HIDDEN_ALL_RE = new RegExp(HIDDEN_RE.source, "gu");

/** True when `text` holds a character that shows as nothing or moves the text around it. */
export function holdsHidden(text: string): boolean {
  return HIDDEN_RE.test(text);
}

/** `U+202E`, as a code point is written. */
function codePoint(char: string): string {
  return `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`;
}

/** A hidden character as dek shows it, so a reader sees it is there and which it is. */
function marker(char: string): string {
  return `⟨${codePoint(char)}⟩`;
}

/** `text` with each hidden character as dek shows it, `⟨U+XXXX⟩`, and the rest as it is. */
export function revealHidden(text: string): string {
  return text.replace(HIDDEN_ALL_RE, marker);
}

/** A line of a file someone else wrote that holds characters a person cannot see. */
export type HiddenText = {
  path: string;
  line: number;
  /** 1-based, in UTF-16 units as editors count: where the first of them is. */
  column: number;
  /** Each of them on the line, in order, as U+XXXX. */
  codePoints: string[];
};

/** Each line of `text`, read from `path` and starting at line `firstLine`, that holds any. */
export function hiddenText(text: string, path: string, firstLine = 1): HiddenText[] {
  return text.split("\n").flatMap((line, index) => {
    const found = [...line.matchAll(HIDDEN_ALL_RE)];
    const [first] = found;
    if (first === undefined) {
      return [];
    }
    return [
      {
        path,
        line: firstLine + index,
        column: first.index + 1,
        codePoints: found.map((match) => codePoint(match[0])),
      },
    ];
  });
}

/**
 * One line of someone else's text inside dek's own: each hidden character shows as `⟨U+XXXX⟩`,
 * whitespace and control characters as one space, and the line is cut to `max` characters with
 * an ellipsis, never through a marker.
 */
export function foreignLine(text: string, max: number): string {
  const units: string[] = [];
  for (const char of text) {
    const unit = HIDDEN_RE.test(char) ? marker(char) : SPACE_RE.test(char) ? " " : char;
    if (unit !== " " || (units.length > 0 && units.at(-1) !== " ")) {
      units.push(unit);
    }
  }
  if (units.at(-1) === " ") {
    units.pop();
  }
  const width = (unit: string) => [...unit].length;
  if (units.reduce((sum, unit) => sum + width(unit), 0) <= max) {
    return units.join("");
  }
  const kept: string[] = [];
  let size = 0;
  for (const unit of units) {
    if (size + width(unit) > max - 1) {
      break;
    }
    kept.push(unit);
    size += width(unit);
  }
  return `${kept.join("")}…`;
}

/** The longest message dek gives that quotes someone else's text, such as Bun's on their source. */
export const MESSAGE_MAX = 200;

/** The longest name a list shows: a deck's folder names a deck, it does not describe one. */
const NAME_MAX = 40;

/** How many names a list shows before it counts the rest. */
const LIST_MAX = 10;

/** Names someone else chose, each a foreignLine of NAME_MAX, the first LIST_MAX and a count of the rest. */
export function foreignList(names: string[]): string {
  const shown = names.slice(0, LIST_MAX).map((name) => foreignLine(name, NAME_MAX));
  const rest = names.length - shown.length;
  return rest > 0 ? `${shown.join(", ")}, and ${rest} more` : shown.join(", ");
}
