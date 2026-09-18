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
      Number.isFinite(parsed.slideIndex) &&
      Number.isFinite(parsed.beatIndex) &&
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

export function positionsEqual(a: Position, b: Position): boolean {
  return a.slideIndex === b.slideIndex && a.beatIndex === b.beatIndex;
}

export function hashChangeTarget(
  current: Position,
  hash: string,
  slugs: string[],
): Position | undefined {
  const next = parseHash(hash, slugs);
  if (positionsEqual(current, next)) {
    return undefined;
  }
  return next;
}
