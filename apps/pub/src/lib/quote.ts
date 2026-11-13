// Quoting a passage of the script, as the W3C TextQuoteSelector does: the passage itself and up to
// 32 characters on each side, so the same words said twice on one slide are told apart. Pure, so
// the composer and the highlighter agree on where a quote is.

const CONTEXT_CHARS = 32;
const MAX_QUOTE_CHARS = 500;

export type Quote = { quote: string; prefix: string; suffix: string };

export type Range = { start: number; end: number };

/**
 * The quote a selection from `start` to `end` of `text` makes, its edges trimmed of whitespace and
 * its length capped; null when nothing but whitespace is selected.
 */
export function quoteAt(text: string, start: number, end: number): Quote | null {
  let from = Math.max(0, Math.min(start, end, text.length));
  let to = Math.min(text.length, Math.max(start, end, 0));
  while (from < to && /\s/.test(text.charAt(from))) {
    from++;
  }
  while (to > from && /\s/.test(text.charAt(to - 1))) {
    to--;
  }
  if (to - from > MAX_QUOTE_CHARS) {
    to = from + MAX_QUOTE_CHARS;
    while (to > from && /\s/.test(text.charAt(to - 1))) {
      to--;
    }
  }
  if (from === to) {
    return null;
  }
  return {
    quote: text.slice(from, to),
    prefix: text.slice(Math.max(0, from - CONTEXT_CHARS), from),
    suffix: text.slice(to, to + CONTEXT_CHARS),
  };
}

/**
 * Where `quote` is in `text`: of every place the words occur, the one whose surroundings agree
 * most with the prefix and suffix; null when they do not occur.
 */
export function locateQuote(text: string, quote: Quote): Range | null {
  if (!quote.quote) {
    return null;
  }
  let best: Range | null = null;
  let bestScore = -1;
  for (let at = text.indexOf(quote.quote); at !== -1; at = text.indexOf(quote.quote, at + 1)) {
    const end = at + quote.quote.length;
    const score =
      commonSuffix(text.slice(Math.max(0, at - quote.prefix.length), at), quote.prefix) +
      commonPrefix(text.slice(end, end + quote.suffix.length), quote.suffix);
    if (score > bestScore) {
      best = { start: at, end };
      bestScore = score;
    }
  }
  return best;
}

function commonPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) {
    n++;
  }
  return n;
}

function commonSuffix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) {
    n++;
  }
  return n;
}

export type Mark = Range & { id: string };

/** A run of text, and the comments whose quote covers it (none for plain text). */
export type Segment = { text: string; ids: string[] };

/** `text` cut where any mark starts or ends, each piece naming the marks over it. */
export function segments(text: string, marks: readonly Mark[]): Segment[] {
  const inside = marks.filter((mark) => mark.end > mark.start);
  if (inside.length === 0) {
    return [{ text, ids: [] }];
  }
  const cuts = new Set<number>([0, text.length]);
  for (const mark of inside) {
    cuts.add(Math.max(0, mark.start));
    cuts.add(Math.min(text.length, mark.end));
  }
  const points = [...cuts].sort((a, b) => a - b);
  const result: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i] ?? 0;
    const to = points[i + 1] ?? 0;
    if (to <= from) {
      continue;
    }
    const ids = inside
      .filter((mark) => mark.start <= from && mark.end >= to)
      .map((mark) => mark.id);
    result.push({ text: text.slice(from, to), ids });
  }
  return result;
}
