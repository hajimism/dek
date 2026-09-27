import { type BeatRef, type Position, stopCount } from "./step.ts";

/** A slide as navigation sees it: its slug, and how many stops it has. */
type SlideStops = { slug: string; stops: number };

/** The deck as navigation sees it, in slide order. */
export type DeckStops = readonly SlideStops[];

/** Only the stop counts matter to stepping; the hash also needs each slug. */
type Stops = ReadonlyArray<{ stops: number }>;

export function deckStops(slides: ReadonlyArray<{ slug: string; beats: BeatRef[] }>): DeckStops {
  return slides.map((slide) => ({ slug: slide.slug, stops: stopCount(slide.beats) }));
}

export function formatHash(pos: Position, slugs: string[]): string {
  const slug = slugs[pos.slideIndex];
  if (!slug) {
    return "";
  }
  if (pos.beatIndex <= 0) {
    return `#${slug}`;
  }
  return `#${slug}/${pos.beatIndex}`;
}

function parseHash(hash: string, slugs: string[]): Position {
  const origin = { slideIndex: 0, beatIndex: 0 };
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) {
    return origin;
  }
  const [slug, beatRaw] = raw.split("/");
  const slideIndex = slugs.indexOf(slug ?? "");
  if (slideIndex < 0) {
    return origin;
  }
  const beat = beatRaw ? Number(beatRaw) : 0;
  if (!Number.isInteger(beat) || beat < 0) {
    return { slideIndex, beatIndex: 0 };
  }
  return { slideIndex, beatIndex: beat };
}

/**
 * `pos` inside the deck: a beat past its slide's last is that last beat, and a slide past the
 * deck's last is the last slide's last beat. None when the deck has no slides.
 */
export function clampPosition(pos: Position, slides: Stops): Position | undefined {
  const last = slides.length - 1;
  if (last < 0) {
    return undefined;
  }
  const slideIndex = Math.min(pos.slideIndex, last);
  const lastBeat = Math.max(0, (slides[slideIndex]?.stops ?? 1) - 1);
  return {
    slideIndex,
    beatIndex: slideIndex < pos.slideIndex ? lastBeat : Math.min(pos.beatIndex, lastBeat),
  };
}

export function positionsEqual(a: Position, b: Position): boolean {
  return a.slideIndex === b.slideIndex && a.beatIndex === b.beatIndex;
}

/** Talk order: negative when `a` comes before `b`. */
export function comparePositions(a: Position, b: Position): number {
  return a.slideIndex - b.slideIndex || a.beatIndex - b.beatIndex;
}

/** The position a hash names, with its beat clamped to the slide's last. */
export function positionFromHash(hash: string, slides: DeckStops): Position {
  const parsed = parseHash(
    hash,
    slides.map((slide) => slide.slug),
  );
  return clampPosition(parsed, slides) ?? { slideIndex: 0, beatIndex: 0 };
}

export function hashChangeTarget(
  current: Position,
  hash: string,
  slides: DeckStops,
): Position | undefined {
  const next = positionFromHash(hash, slides);
  if (positionsEqual(current, next)) {
    return undefined;
  }
  return next;
}

/**
 * How a move is written to the URL. Each slide gets one history entry and its beats replace it,
 * so Back leaves the slide rather than stepping back through every beat.
 */
export function historyMode(from: Position, to: Position): "push" | "replace" {
  return from.slideIndex === to.slideIndex ? "replace" : "push";
}

export type Move = "advance" | "retreat" | "first" | "last";

export function advance(pos: Position, slides: Stops): Position | null {
  const count = slides[pos.slideIndex]?.stops;
  if (count === undefined) {
    return null;
  }
  if (pos.beatIndex + 1 < count) {
    return { slideIndex: pos.slideIndex, beatIndex: pos.beatIndex + 1 };
  }
  const nextSlide = pos.slideIndex + 1;
  if (nextSlide >= slides.length) {
    return null;
  }
  return { slideIndex: nextSlide, beatIndex: 0 };
}

export function retreat(pos: Position, slides: Stops): Position | null {
  if (pos.beatIndex > 0) {
    return { slideIndex: pos.slideIndex, beatIndex: pos.beatIndex - 1 };
  }
  const prevSlide = pos.slideIndex - 1;
  if (prevSlide < 0) {
    return null;
  }
  const prevCount = slides[prevSlide]?.stops ?? 0;
  return { slideIndex: prevSlide, beatIndex: Math.max(prevCount - 1, 0) };
}

/** Where `move` leads from `pos`, or null at either end of the talk. */
export function moveTarget(move: Move, pos: Position, slides: Stops): Position | null {
  switch (move) {
    case "advance":
      return advance(pos, slides);
    case "retreat":
      return retreat(pos, slides);
    case "first":
      return slides.length > 0 ? { slideIndex: 0, beatIndex: 0 } : null;
    case "last": {
      const slideIndex = slides.length - 1;
      if (slideIndex < 0) {
        return null;
      }
      return { slideIndex, beatIndex: Math.max((slides[slideIndex]?.stops ?? 0) - 1, 0) };
    }
  }
}
