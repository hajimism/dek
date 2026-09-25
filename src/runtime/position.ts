import type { Position } from "../core/step.ts";

export function formatHash(pos: Position, slugs: string[]): string {
  const slug = slugs[pos.slideIndex];
  if (!slug) {
    return "";
  }
  if (pos.beatIndex <= 0) {
    return `#${slug}`;
  }
  return `#${slug}/${pos.beatIndex + 1}`;
}

export function parseHash(hash: string, slugs: string[]): Position {
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
  const beat = beatRaw ? Number(beatRaw) : 1;
  if (!Number.isFinite(beat) || beat < 1) {
    return { slideIndex, beatIndex: 0 };
  }
  return { slideIndex, beatIndex: beat - 1 };
}

export function parsePosition(payload: string): Position | undefined {
  try {
    const parsed = JSON.parse(payload) as { slideIndex?: unknown; beatIndex?: unknown };
    if (
      typeof parsed.slideIndex === "number" &&
      typeof parsed.beatIndex === "number" &&
      Number.isInteger(parsed.slideIndex) &&
      Number.isInteger(parsed.beatIndex) &&
      parsed.slideIndex >= 0 &&
      parsed.beatIndex >= 0
    ) {
      return { slideIndex: parsed.slideIndex, beatIndex: parsed.beatIndex };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function clampPosition(
  pos: Position,
  slides: Array<{ beats: number }>,
): Position | undefined {
  const slide = slides[pos.slideIndex];
  if (!slide) {
    return undefined;
  }
  const lastBeat = Math.max(0, slide.beats - 1);
  return {
    slideIndex: pos.slideIndex,
    beatIndex: Math.min(pos.beatIndex, lastBeat),
  };
}

export function positionsEqual(a: Position, b: Position): boolean {
  return a.slideIndex === b.slideIndex && a.beatIndex === b.beatIndex;
}

/** The position a hash names, with its beat clamped to the slide's last. */
export function positionFromHash(
  hash: string,
  slides: Array<{ slug: string; beats: number }>,
): Position {
  const parsed = parseHash(
    hash,
    slides.map((slide) => slide.slug),
  );
  return clampPosition(parsed, slides) ?? { slideIndex: 0, beatIndex: 0 };
}

export function hashChangeTarget(
  current: Position,
  hash: string,
  slides: Array<{ slug: string; beats: number }>,
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
