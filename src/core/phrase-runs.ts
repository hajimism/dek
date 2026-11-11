/**
 * What the build and the page agree a run of text is, so a phrase table the build writes reads the
 * same on the page. A run is the text a slide shows between two places that end one: the start or
 * the end of an element that is not inside a line, a `<br>`, or text left out. It goes through
 * inline elements, so 「台本を<strong>先に</strong>書く」 is one run, and across comments.
 *
 * Both sides go by tag names rather than by layout, since the build has no browser. Where they
 * still part, as on markup the parser repairs, the page reads a run the table does not hold and
 * leaves it as it is: a table holds only what follows from a run's own text.
 */

/** The attribute a slide section carries its phrase table in. */
export const PHRASES_ATTRIBUTE = "data-dek-phrases";

/** Where each run breaks into phrases, by `runKey` of its text: offsets into the run. */
export type PhraseTable = Record<string, number[]>;

/** Elements that sit inside a line of text, which a run goes through. */
export const RUN_TAGS: ReadonlySet<string> = new Set([
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "cite",
  "data",
  "del",
  "dfn",
  "em",
  "i",
  "ins",
  "label",
  "mark",
  "q",
  "rb",
  "ruby",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "time",
  "u",
  "var",
  "wbr",
]);

/** Ruby's readings, set over a word and not part of it: a run goes on past them without their text. */
export const READING_TAGS: ReadonlySet<string> = new Set(["rp", "rt", "rtc"]);

/** Elements whose text is not broken into phrases: code, what is not drawn as text, and drawings. */
export const UNREAD_TAGS: ReadonlySet<string> = new Set([
  "code",
  "kbd",
  "math",
  "noscript",
  "pre",
  "samp",
  "script",
  "style",
  "svg",
  "template",
  "textarea",
]);

/** A short name for a run's text, by its length and a 32-bit FNV-1a hash of its UTF-16 units. */
export function runKey(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${text.length.toString(36)}.${hash.toString(36)}`;
}
