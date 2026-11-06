/**
 * The words of a deck as dek-words looks in them, each with the place it is written. A block is one
 * run of text a reader takes as a whole: a heading, a paragraph, an item, a cell. A word is only
 * found inside one block, never across two.
 */

/** One block's text, with each run of whitespace as one space; `at[i]` is where `text[i]` starts in the source. */
export type Block = { text: string; at: number[] };

/**
 * What a run of whitespace holds: spaces alone, a line break of the source, or a break written as
 * one, such as `<br>`, which the reader sees whatever is around it.
 */
type Gap = "space" | "break" | "written";

/**
 * Letters written with no space between words, which a browser joins across a line break of the
 * source, as CSS Text 3 has it: Han, kana, and their full-width punctuation, but not Hangul.
 */
const UNSPACED =
  /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303f\u30fc\uff01-\uff60\uffe0-\uffe6]$/u;

/** Builds blocks one character at a time, folding each run of whitespace into one space. */
class Blocks {
  readonly done: Block[] = [];
  private text = "";
  private at: number[] = [];
  private last = "";
  private space: { offset: number; gap: Gap } | undefined;

  /** `char` written at `offset`: a code unit or two, one character either way. */
  add(char: string, offset: number): void {
    if (/^\s$/u.test(char)) {
      this.gap(offset, char === "\n" || char === "\r" ? "break" : "space");
      return;
    }
    // A line break between two such letters is no space to the reader: 解像 and 度 are 解像度.
    const joined = this.space?.gap === "break" && UNSPACED.test(this.last) && UNSPACED.test(char);
    if (this.space !== undefined && this.text !== "" && !joined) {
      this.text += " ";
      this.at.push(this.space.offset);
    }
    this.space = undefined;
    this.text += char;
    this.last = char;
    for (let unit = 0; unit < char.length; unit += 1) {
      this.at.push(offset);
    }
  }

  /** Whitespace at `offset`, which joins the run before it; a written break wins over the rest. */
  gap(offset: number, gap: Gap): void {
    if (this.space === undefined) {
      this.space = { offset, gap };
    } else if (gap !== "space" && this.space.gap !== "written") {
      this.space.gap = gap;
    }
  }

  /** Ends the block being built, if it has any text. */
  end(): void {
    if (this.text !== "") {
      this.done.push({ text: this.text, at: this.at });
    }
    this.text = "";
    this.at = [];
    this.last = "";
    this.space = undefined;
  }
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Adds `text`, written at `offset`, reading character references as the characters they stand for. */
function addDecoded(blocks: Blocks, text: string, offset: number): void {
  for (let index = 0; index < text.length; ) {
    const reference =
      text[index] === "&" ? /^&(#x[0-9a-f]+|#\d+|[a-z]+);/i.exec(text.slice(index)) : null;
    const decoded = reference ? decodeReference(reference[1] as string) : undefined;
    if (reference && decoded !== undefined) {
      blocks.add(decoded, offset + index);
      index += reference[0].length;
      continue;
    }
    const char = String.fromCodePoint(text.codePointAt(index) as number);
    blocks.add(char, offset + index);
    index += char.length;
  }
}

function decodeReference(name: string): string | undefined {
  if (name.startsWith("#")) {
    const code =
      name[1] === "x" || name[1] === "X"
        ? Number.parseInt(name.slice(2), 16)
        : Number(name.slice(1));
    return Number.isInteger(code) && code >= 0 && code <= 0x10ffff
      ? String.fromCodePoint(code)
      : undefined;
  }
  return ENTITIES[name.toLowerCase()];
}

/** Elements whose content no reader sees as words on the slide, as dek-study has them. */
const UNSEEN = new Set(["script", "style", "template", "noscript"]);

/** Elements that sit inside a line of text; every other element starts and ends a block. */
const INLINE = new Set([
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "cite",
  "code",
  "data",
  "del",
  "dfn",
  "em",
  "i",
  "img",
  "ins",
  "kbd",
  "label",
  "mark",
  "q",
  "rb",
  "rp",
  "rt",
  "rtc",
  "ruby",
  "s",
  "samp",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "time",
  "tspan",
  "u",
  "var",
  "wbr",
]);

const HTML_TOKEN =
  /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+|</g;

/**
 * Ruby's readings, set over a word and not part of it. Their end tags may be left out, so a
 * reading ends at the next one, at a base, or where the ruby or the block ends.
 */
const READINGS = new Set(["rt", "rp", "rtc"]);

/**
 * A slide's words as a reader sees them, in document order: not inside `script`, `style`,
 * `template`, or `noscript`, nor in comments or ruby's readings. A `<br>` is a space, and a line
 * break of the source between Japanese letters is none.
 */
export function slideBlocks(html: string): Block[] {
  const blocks = new Blocks();
  let reading = false;
  HTML_TOKEN.lastIndex = 0;
  for (let token = HTML_TOKEN.exec(html); token; token = HTML_TOKEN.exec(html)) {
    const [whole, closing, rawName] = token;
    if (rawName === undefined) {
      if (!whole.startsWith("<!--") && !reading) {
        addDecoded(blocks, whole, token.index);
      }
      continue;
    }
    const name = rawName.toLowerCase();
    if (name === "br") {
      blocks.gap(token.index, "written");
      continue;
    }
    if (READINGS.has(name)) {
      reading = closing === "";
    } else if (name === "rb" || name === "ruby" || !INLINE.has(name)) {
      reading = false;
    }
    if (!INLINE.has(name)) {
      blocks.end();
    }
    if (closing === "" && UNSEEN.has(name)) {
      const close = new RegExp(`</${name}\\s*>`, "gi");
      close.lastIndex = HTML_TOKEN.lastIndex;
      const found = close.exec(html);
      HTML_TOKEN.lastIndex = found ? close.lastIndex : html.length;
    }
  }
  blocks.end();
  return blocks.done;
}

/** A line's text with the source offset of each code unit, which inline syntax is taken out of. */
type Run = { text: string; at: number[] };

/** `run` with every match of `pattern` replaced by its first group, or by nothing. */
function strip(source: Run, pattern: RegExp): Run {
  let text = "";
  const at: number[] = [];
  let last = 0;
  for (const match of source.text.matchAll(pattern)) {
    const start = match.index;
    text += source.text.slice(last, start);
    at.push(...source.at.slice(last, start));
    const kept = match[1];
    if (kept !== undefined) {
      const from = start + match[0].indexOf(kept);
      text += kept;
      at.push(...source.at.slice(from, from + kept.length));
    }
    last = start + match[0].length;
  }
  text += source.text.slice(last);
  at.push(...source.at.slice(last));
  return { text, at };
}

/** Inline Markdown that is not words: code, images, a link's target, emphasis, and tags. */
const INLINE_SYNTAX: RegExp[] = [
  // A group is what `strip` keeps, so code has none: a span of two backticks, then of one.
  /``.*?``/g,
  /`[^`]*`/g,
  /!\[[^\]]*\]\([^)]*\)/g,
  /\[([^\]]*)\]\([^)]*\)/g,
  /<\/?[a-zA-Z][^>]*>/g,
  /\*+|~~/g,
];

/**
 * The words of script.md: headings without their `{#id}`, paragraphs and list items, each with the
 * lines that continue it, and table cells. Not the frontmatter, code, HTML comments, or
 * blockquotes, which are the speaker's directions and never reach the audience.
 */
export function scriptBlocks(markdown: string): Block[] {
  const blocks = new Blocks();
  const lines = markdown.split("\n");
  let offset = 0;
  let front = lines[0]?.trim() === "---";
  let fence: string | undefined;
  let comment = false;
  // A paragraph or an item is open, and a line of plain text after it goes on with it.
  let open = false;
  const close = () => {
    blocks.end();
    open = false;
  };
  lines.forEach((raw, index) => {
    const start = offset;
    offset += raw.length + 1;
    const line = raw.replace(/\r$/, "");
    if (front) {
      if (index > 0 && /^(---|\.\.\.)\s*$/.test(line)) {
        front = false;
      }
      return;
    }
    if (fence !== undefined) {
      if (line.trim().startsWith(fence)) {
        fence = undefined;
      }
      return;
    }
    const opens = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (opens) {
      close();
      fence = opens[1];
      return;
    }
    // A comment can start, end, or sit inside a line.
    let kept = "";
    const at: number[] = [];
    for (let column = 0; column < line.length; ) {
      if (comment) {
        const end = line.indexOf("-->", column);
        if (end === -1) {
          break;
        }
        comment = false;
        column = end + 3;
        continue;
      }
      const open = line.indexOf("<!--", column);
      const until = open === -1 ? line.length : open;
      kept += line.slice(column, until);
      for (let unit = column; unit < until; unit += 1) {
        at.push(start + unit);
      }
      if (open === -1) {
        break;
      }
      comment = true;
      column = open + 4;
    }
    let text: Run = { text: kept, at };
    if (/^\s{0,3}>/.test(text.text) || text.text.trim() === "") {
      close();
      return;
    }
    if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(text.text)) {
      close();
      return;
    }
    const heading = /^\s{0,3}#{1,6}(?:\s|$)/.test(text.text);
    const item = /^\s*(?:[-*+]|\d+[.)])\s+/.test(text.text);
    const table = text.text.trimStart().startsWith("|");
    if (open && !heading && !item && !table) {
      // The line break before this line, so 解像 and 度 on two lines are 解像度.
      blocks.gap(start - 1, "break");
    } else {
      close();
    }
    text = strip(text, /^\s{0,3}#{1,6}\s+|\s*\{#[^}]*\}\s*$|\s+#+\s*$/g);
    text = strip(text, /^\s*(?:[-*+]|\d+[.)])\s+/g);
    const cells = table ? splitCells(text) : [text];
    for (const cell of cells) {
      const words = INLINE_SYNTAX.reduce(strip, cell);
      [...words.text].reduce((unit, char) => {
        blocks.add(char, words.at[unit] as number);
        return unit + char.length;
      }, 0);
      if (heading || table) {
        blocks.end();
      }
    }
    open = !heading && !table;
  });
  blocks.end();
  return blocks.done;
}

/** A table row's cells, split at each `|` that is not escaped. */
function splitCells(row: Run): Run[] {
  const cells: Run[] = [];
  let from = 0;
  for (let index = 0; index <= row.text.length; index += 1) {
    if (index === row.text.length || (row.text[index] === "|" && row.text[index - 1] !== "\\")) {
      cells.push({ text: row.text.slice(from, index), at: row.at.slice(from, index) });
      from = index + 1;
    }
  }
  return cells;
}
