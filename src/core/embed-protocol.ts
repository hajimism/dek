// What a built deck and a page that frames it say to each other through `postMessage`: the embed
// API (ADR 45). The player bundles this for the browser, so it holds shapes and checks only, with
// no zod and no Node imports. Each message is a plain object whose `type` starts with `dek:`.

import { type BeatRef, type Position, resolveStop, stepKey, stepKeys } from "./step.ts";

/** Bumped when a message changes in a way a page written for the older one cannot read. */
export const EMBED_PROTOCOL = 1;

/** A box on a slide, in the slide's own pixels, as annotate mode measures one. */
export type EmbedBox = { x: number; y: number; width: number; height: number };

/** Where the deck stands: the slide's slug, its step as `dekc shot --step` takes it, its index. */
export type EmbedStop = { slug: string; step: string; index: number };

/** A numbered pin the framing page asks the deck to draw on a slide. */
export type EmbedMark = { id: string; number: number; slug: string; step: string; box: EmbedBox };

/** What the framing page may ask. */
export type EmbedRequest =
  | { type: "dek:goto"; slug: string; step?: string }
  | { type: "dek:current" }
  | { type: "dek:pick"; on: boolean }
  | { type: "dek:marks"; marks: EmbedMark[] };

/** An element of a slide, as `ElementTarget` in `src/pub/protocol.ts` holds one. */
type EmbedElementTarget = {
  kind: "element";
  path: string;
  name: string;
  text: string;
  box: EmbedBox;
};

/** What the deck tells the framing page. Nothing here carries the script, notes, or speaker data. */
export type EmbedMessage =
  | {
      type: "dek:ready";
      protocol: number;
      deck: string;
      /** The slide's own size, the pixels every box is measured in. */
      size: { width: number; height: number };
      slides: Array<{ slug: string; steps: string[] }>;
      current: EmbedStop;
    }
  | ({ type: "dek:moved" } & EmbedStop)
  | { type: "dek:picked"; slug: string; step: string; target: EmbedElementTarget }
  | { type: "dek:pick-cancel" }
  | { type: "dek:mark"; id: string };

type Slides = ReadonlyArray<{ slug: string; beats: BeatRef[] }>;

/** The longest string a request may carry, and the most marks: a page asks for no more. */
const MAX_STRING = 256;
const MAX_MARKS = 1000;

type Fields = Record<string, unknown>;

const isText = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= MAX_STRING;

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** A plain object holding exactly `required`, and of `optional` only what it names. */
function hasOnly(value: unknown, required: string[], optional: string[] = []): value is Fields {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

function isBox(value: unknown): value is EmbedBox {
  return (
    hasOnly(value, ["x", "y", "width", "height"]) &&
    isNumber(value.x) &&
    isNumber(value.y) &&
    isNumber(value.width) &&
    isNumber(value.height) &&
    value.width >= 0 &&
    value.height >= 0
  );
}

function isMark(value: unknown): value is EmbedMark {
  return (
    hasOnly(value, ["id", "number", "slug", "step", "box"]) &&
    isText(value.id) &&
    Number.isSafeInteger(value.number) &&
    (value.number as number) >= 0 &&
    isText(value.slug) &&
    isText(value.step) &&
    isBox(value.box)
  );
}

/** Each request's own check; a type left out here is never let through. */
const REQUESTS: Record<EmbedRequest["type"], (value: unknown) => boolean> = {
  "dek:goto": (value) =>
    hasOnly(value, ["type", "slug"], ["step"]) &&
    isText(value.slug) &&
    (!Object.hasOwn(value, "step") || isText(value.step)),
  "dek:current": (value) => hasOnly(value, ["type"]),
  "dek:pick": (value) => hasOnly(value, ["type", "on"]) && typeof value.on === "boolean",
  "dek:marks": (value) =>
    hasOnly(value, ["type", "marks"]) &&
    Array.isArray(value.marks) &&
    value.marks.length <= MAX_MARKS &&
    value.marks.every(isMark),
};

/**
 * The request a message holds, or undefined for anything else: a message of another kind, one
 * of a type the deck does not take, or one with a field missing, mistyped, or not in the request.
 */
export function readEmbedRequest(value: unknown): EmbedRequest | undefined {
  if (typeof value !== "object" || value === null || !Object.hasOwn(value, "type")) {
    return undefined;
  }
  const type = (value as Fields).type;
  if (typeof type !== "string" || !Object.hasOwn(REQUESTS, type)) {
    return undefined;
  }
  return REQUESTS[type as EmbedRequest["type"]](value) ? (value as EmbedRequest) : undefined;
}

/** Where `dek:goto` goes: the slide named, at the stop named, as `dekc shot --step` takes it. */
export function gotoPosition(slides: Slides, slug: string, step = "0"): Position | undefined {
  const slideIndex = slides.findIndex((slide) => slide.slug === slug);
  const slide = slides[slideIndex];
  const beatIndex = slide ? resolveStop(slide.beats, step) : undefined;
  return beatIndex === undefined ? undefined : { slideIndex, beatIndex };
}

/** `pos` as the messages name a stop. */
export function embedStop(slides: Slides, pos: Position): EmbedStop {
  const slide = slides[pos.slideIndex];
  return {
    slug: slide?.slug ?? "",
    step: stepKey(slide?.beats ?? [], pos.beatIndex),
    index: pos.slideIndex,
  };
}

export function readyMessage(
  deck: { name: string; size: { width: number; height: number } },
  slides: Slides,
  pos: Position,
): EmbedMessage {
  return {
    type: "dek:ready",
    protocol: EMBED_PROTOCOL,
    deck: deck.name,
    size: { width: deck.size.width, height: deck.size.height },
    slides: slides.map((slide) => ({ slug: slide.slug, steps: stepKeys(slide.beats) })),
    current: embedStop(slides, pos),
  };
}

export function movedMessage(slides: Slides, pos: Position): EmbedMessage {
  return { type: "dek:moved", ...embedStop(slides, pos) };
}

/** The element picked on the slide `at`, named by its slide's HTML file. */
export function pickedMessage(
  at: { slug: string; step: string },
  element: { name: string; text: string; box: EmbedBox },
): EmbedMessage {
  return {
    type: "dek:picked",
    slug: at.slug,
    step: at.step,
    target: { kind: "element", path: `slides/${at.slug}.html`, ...element },
  };
}
