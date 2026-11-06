/**
 * Where each sticker sits in a slide's words, decided the same in the check and in the page, so a
 * deck that passes lint is a deck whose stickers the page finds.
 */

/** What a sticker needs to be placed: its words, the words right before them, and its line. */
export type Placeable = { quote: string; prefix?: string; line: number };

export type Placement<S extends Placeable> = {
  /** Each sticker that found its place, with where its words start in the text. */
  placed: Array<{ sticker: S; at: number }>;
  /** Each sticker whose words are not where it says. */
  lost: S[];
  /** Words a sticker hides that show again with no sticker over them: how often, and the first sticker. */
  shown: Array<{ quote: string; first: S; count: number }>;
};

/** Text with each run of whitespace as one space, trimmed, as words are compared. */
export function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Places each sticker in `text`, a slide's words as `normalize` leaves them. Stickers over the same
 * words take their places in order: one with a prefix the first place that follows it, then one
 * without the first place left.
 */
export function placeStickers<S extends Placeable>(text: string, stickers: S[]): Placement<S> {
  const placement: Placement<S> = { placed: [], lost: [], shown: [] };
  const inOrder = stickers.toSorted((a, b) => a.line - b.line);
  for (const [quote, same] of Map.groupBy(inOrder, (sticker) => normalize(sticker.quote))) {
    const places = occurrences(text, quote);
    const taken = new Set<number>();
    const placed: S[] = [];
    for (const sticker of [...same.filter((s) => s.prefix), ...same.filter((s) => !s.prefix)]) {
      const prefix = sticker.prefix === undefined ? undefined : normalize(sticker.prefix);
      const at = places.find(
        (place) => !taken.has(place) && (prefix === undefined || follows(text, place, prefix)),
      );
      if (at === undefined) {
        placement.lost.push(sticker);
        continue;
      }
      taken.add(at);
      placed.push(sticker);
      placement.placed.push({ sticker, at });
    }
    const count = places.length - taken.size;
    const first = placed.toSorted((a, b) => a.line - b.line)[0];
    if (count > 0 && first) {
      placement.shown.push({ quote, first, count });
    }
  }
  placement.placed.sort((a, b) => a.sticker.line - b.sticker.line);
  return placement;
}

/** Whether the words right before `place` in `text` end with `prefix`, as normalized. */
export function follows(text: string, place: number, prefix: string): boolean {
  return text.slice(0, place).trimEnd().endsWith(prefix);
}

/**
 * A letter or digit of a script written with spaces between words. Next to one, a quote that
 * starts or ends with one is part of a longer word: `is` is not in "This". Japanese, Chinese,
 * Korean, and Thai run on without spaces, so a quote is any run of their words.
 */
const SPACED = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Nd}]/u;

/** Where `quote` starts in `text`, each place it does, without overlaps, as whole words. */
export function occurrences(text: string, quote: string): number[] {
  const found: number[] = [];
  if (quote === "") {
    return found;
  }
  const end = quote.length;
  const opens = SPACED.test(quote[0] ?? "");
  const closes = SPACED.test(quote[end - 1] ?? "");
  for (let at = text.indexOf(quote); at !== -1; ) {
    const whole =
      !(opens && SPACED.test(text[at - 1] ?? "")) && !(closes && SPACED.test(text[at + end] ?? ""));
    if (whole) {
      found.push(at);
    }
    at = text.indexOf(quote, whole ? at + end : at + 1);
  }
  return found;
}
