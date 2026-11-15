/** Whether `event` opens the search: a bare `/`, whichever key a layout types it with. */
export function isSearchKey(event: {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
}): boolean {
  return !(event.repeat || event.altKey || event.ctrlKey || event.metaKey) && event.key === "/";
}

/** A text the search reads: a slide's title, the words on the slide, or its script. */
export type SearchSource = {
  slideIndex: number;
  kind: "title" | "slide" | "script";
  text: string;
  /** The beat each character of `text` first shows at; without it, every one shows on arrival. */
  beats?: number[];
};

/** Where a slide's match is quoted from, as places in that text. */
type SearchSnippet = {
  kind: "slide" | "script";
  text: string;
  start: number;
  end: number;
};

/** One slide that says the query: where to go to see it, and how often it says it. */
export type SearchHit = {
  slideIndex: number;
  beatIndex: number;
  /** The matches on the slide and in its script; a slide's heading often repeats its title. */
  count: number;
  /** Absent when only the title says it. */
  snippet?: SearchSnippet;
};

// A base character with the marks that combine with it, so that NFKC can compose them: a
// half-width voiced mark is no combining mark, yet joins the kana before it into one.
const CLUSTER = /[^\p{M}ﾞﾟ][\p{M}ﾞﾟ]*|[\p{M}ﾞﾟ]+/gsu;

/**
 * `text` as the search compares it: NFKC, lower case, with no white space, since a line on a
 * slide breaks wherever it fits. Each folded character remembers the stretch of `text` it came
 * from, so a match maps back.
 */
function fold(text: string): { folded: string; from: number[]; to: number[] } {
  let folded = "";
  const from: number[] = [];
  const to: number[] = [];
  for (const found of text.matchAll(CLUSTER)) {
    const start = found.index;
    const end = start + found[0].length;
    for (const char of found[0].normalize("NFKC").toLowerCase()) {
      if (/\s/u.test(char)) {
        continue;
      }
      folded += char;
      for (let i = 0; i < char.length; i += 1) {
        from.push(start);
        to.push(end);
      }
    }
  }
  return { folded, from, to };
}

/** Every place `text` says `query`, as `[start, end)` in `text`, none overlapping. */
export function findMatches(text: string, query: string): Array<[number, number]> {
  const needle = fold(query).folded;
  if (!needle) {
    return [];
  }
  const { folded, from, to } = fold(text);
  const matches: Array<[number, number]> = [];
  for (let at = folded.indexOf(needle); at >= 0; at = folded.indexOf(needle, at + needle.length)) {
    matches.push([from[at] as number, to[at + needle.length - 1] as number]);
  }
  return matches;
}

const LEAD = 24;
const TAIL = 80;

/** The match in `text` with a little of what comes before and after it, cut where it runs long. */
export function excerpt(
  text: string,
  start: number,
  end: number,
): { lead: string; match: string; tail: string } {
  const from = Math.max(0, start - LEAD);
  const until = Math.min(text.length, end + TAIL);
  return {
    lead: `${from > 0 ? "…" : ""}${text.slice(from, start)}`,
    match: text.slice(start, end),
    tail: `${text.slice(end, until)}${until < text.length ? "…" : ""}`,
  };
}

/**
 * The slides that say `query`, in the deck's order. Each goes to the earliest beat at which the
 * slide shows a match, and quotes that one; a slide that says it only in its script quotes the
 * script and is shown as it arrives.
 */
export function searchDeck(sources: SearchSource[], query: string): SearchHit[] {
  const hits = new Map<number, SearchHit>();
  for (const source of sources) {
    const matches = findMatches(source.text, query);
    if (matches.length === 0) {
      continue;
    }
    const hit = hits.get(source.slideIndex) ?? {
      slideIndex: source.slideIndex,
      beatIndex: 0,
      count: 0,
    };
    hits.set(source.slideIndex, hit);
    if (source.kind === "title") {
      continue;
    }
    hit.count += matches.length;
    for (const [start, end] of matches) {
      const beatIndex = source.kind === "slide" ? beatOf(source.beats, start, end) : 0;
      if (better(hit, source.kind, beatIndex)) {
        hit.beatIndex = beatIndex;
        hit.snippet = { kind: source.kind, text: source.text, start, end };
      }
    }
  }
  return [...hits.values()].sort((a, b) => a.slideIndex - b.slideIndex);
}

/** The beat by which every character of `[start, end)` shows. */
function beatOf(beats: number[] | undefined, start: number, end: number): number {
  let beat = 0;
  for (let i = start; i < end; i += 1) {
    beat = Math.max(beat, beats?.[i] ?? 0);
  }
  return beat;
}

/** A match on the slide beats one in the script, and an earlier beat a later one. */
function better(hit: SearchHit, kind: "slide" | "script", beatIndex: number): boolean {
  const held = hit.snippet;
  if (!held) {
    return true;
  }
  if (held.kind !== kind) {
    return kind === "slide";
  }
  return kind === "slide" && beatIndex < hit.beatIndex;
}
