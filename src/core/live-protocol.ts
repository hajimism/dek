import type { Diagnostic } from "./diagnostic.ts";
import type { Position } from "./step.ts";

/**
 * What the dev server tells an open deck on `/events`. The server sends these and the page
 * reads them, so both sides take the shape from here.
 */
export type LiveEvent =
  /** Slides by slug: the stream reaches the audience, so it names no path on disk. */
  | { type: "sync"; created: string[]; updated?: string[]; removed?: string[] }
  | { type: "reload-slide"; slug: string }
  | { type: "reload-theme" }
  | { type: "reload-script"; slugs: string[] }
  | { type: "diagnostics"; diagnostics: Diagnostic[] }
  | { type: "timeline" }
  /** The deck's annotations changed; a page that shows them asks for them again. */
  | { type: "annotations" };

export type LiveEventType = LiveEvent["type"];

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isOptionalStrings = (value: unknown): boolean => value === undefined || isStrings(value);

/** Checks each type's own fields; a new type must be placed here to be let through. */
const FIELDS_OK: Record<LiveEventType, (event: Record<string, unknown>) => boolean> = {
  sync: (event) =>
    isStrings(event.created) &&
    isOptionalStrings(event.updated) &&
    isOptionalStrings(event.removed),
  "reload-slide": (event) => typeof event.slug === "string",
  "reload-theme": () => true,
  "reload-script": (event) => isStrings(event.slugs),
  diagnostics: (event) => Array.isArray(event.diagnostics),
  timeline: () => true,
  annotations: () => true,
};

/** Whether a message read off the stream is one this build of the page understands. */
export function isLiveEvent(value: unknown): value is LiveEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const event = value as Record<string, unknown>;
  const type = event.type;
  return typeof type === "string" && Object.hasOwn(FIELDS_OK, type)
    ? FIELDS_OK[type as LiveEventType](event)
    : false;
}

/**
 * A position on the wire: what the socket, the server's rooms, and the windows of one deck send
 * each other. Only the two indexes travel, so nothing else rides along to a room.
 */
export function encodePosition(pos: Position): string {
  return JSON.stringify({ slideIndex: pos.slideIndex, beatIndex: pos.beatIndex });
}

/** A position read off the wire, as text or as the object a BroadcastChannel carries. */
export function decodePosition(raw: unknown): Position | undefined {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const { slideIndex, beatIndex } = value as Record<string, unknown>;
  return isIndex(slideIndex) && isIndex(beatIndex) ? { slideIndex, beatIndex } : undefined;
}

const isIndex = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/**
 * Where the laser points: a slide, and a point on it as a share of its width and height, so every
 * window draws it at the same place on the slide whatever size the window is.
 */
export type Pointer = { slideIndex: number; x: number; y: number };

/** What the laser says on the wire: where it points, or null once it went away. */
export type PointerMessage = { pointer: Pointer | null };

/** Four decimals: a ten-thousandth of the slide is finer than any screen shows it. */
const round = (share: number): number => Math.round(share * 10_000) / 10_000;

export function encodePointer(pointer: Pointer | null): string {
  return JSON.stringify({
    pointer: pointer && {
      slideIndex: pointer.slideIndex,
      x: round(pointer.x),
      y: round(pointer.y),
    },
  });
}

/**
 * A laser message read off the wire, as text or as the object a BroadcastChannel carries; nothing
 * for anything else, a position included. Only the three fields travel, within the slide.
 */
export function decodePointer(raw: unknown): PointerMessage | undefined {
  const value = typeof raw === "string" ? parseJson(raw) : raw;
  if (typeof value !== "object" || value === null || !Object.hasOwn(value, "pointer")) {
    return undefined;
  }
  const pointer = (value as { pointer: unknown }).pointer;
  if (pointer === null) {
    return { pointer: null };
  }
  if (typeof pointer !== "object") {
    return undefined;
  }
  const { slideIndex, x, y } = pointer as Record<string, unknown>;
  return isIndex(slideIndex) && isShare(x) && isShare(y)
    ? { pointer: { slideIndex, x, y } }
    : undefined;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const isShare = (value: unknown): value is number =>
  typeof value === "number" && value >= 0 && value <= 1;
