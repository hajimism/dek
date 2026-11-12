// What the talk page and the deck in its iframe say to each other with postMessage. The deck
// speaks first with `dek:ready`; a deck built before the embed API says nothing, and the page then
// shows it as it is, with nothing to steer. Everything that arrives is checked here, field by
// field, because the deck runs its author's code.

export const EMBED_PROTOCOL = 1;

export type Box = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };

export type Position = { slug: string; step: string; index: number };

export type ReadySlide = { slug: string; steps: string[] };

export type PickedElement = {
  kind: "element";
  path: string;
  name: string;
  text: string;
  box: Box;
};

export type DeckMessage =
  | {
      type: "dek:ready";
      protocol: number;
      deck: string;
      size: Size;
      slides: ReadySlide[];
      current: Position;
    }
  | ({ type: "dek:moved" } & Position)
  | { type: "dek:picked"; slug: string; step: string; target: PickedElement }
  | { type: "dek:pick-cancel" }
  | { type: "dek:mark"; id: string };

export type Mark = { id: string; number: number; slug: string; step: string; box: Box };

export type PageMessage =
  | { type: "dek:goto"; slug: string; step?: string }
  | { type: "dek:current" }
  | { type: "dek:pick"; on: boolean }
  | { type: "dek:marks"; marks: Mark[] };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function readBox(value: unknown): Box | null {
  if (!isObject(value)) {
    return null;
  }
  const { x, y, width, height } = value;
  return isNumber(x) && isNumber(y) && isNumber(width) && isNumber(height)
    ? { x, y, width, height }
    : null;
}

function readPosition(value: Record<string, unknown>): Position | null {
  const { slug, step, index } = value;
  return isString(slug) && isString(step) && isNumber(index) ? { slug, step, index } : null;
}

/** The message, if it is one the deck may send and its fields have their types; else null. */
export function readDeckMessage(data: unknown): DeckMessage | null {
  if (!isObject(data) || !isString(data.type)) {
    return null;
  }
  switch (data.type) {
    case "dek:ready": {
      const { protocol, deck, size, slides, current } = data;
      if (!isNumber(protocol) || !isString(deck) || !isObject(size) || !Array.isArray(slides)) {
        return null;
      }
      if (!isNumber(size.width) || !isNumber(size.height) || size.width <= 0 || size.height <= 0) {
        return null;
      }
      const read: ReadySlide[] = [];
      for (const slide of slides) {
        if (!isObject(slide) || !isString(slide.slug) || !Array.isArray(slide.steps)) {
          return null;
        }
        read.push({ slug: slide.slug, steps: slide.steps.filter(isString) });
      }
      const position = isObject(current) ? readPosition(current) : null;
      if (!position) {
        return null;
      }
      return {
        type: "dek:ready",
        protocol,
        deck,
        size: { width: size.width, height: size.height },
        slides: read,
        current: position,
      };
    }
    case "dek:moved": {
      const position = readPosition(data);
      return position ? { type: "dek:moved", ...position } : null;
    }
    case "dek:picked": {
      const { slug, step, target } = data;
      if (!isString(slug) || !isString(step) || !isObject(target) || target.kind !== "element") {
        return null;
      }
      const box = readBox(target.box);
      if (!box || !isString(target.path) || !isString(target.name) || !isString(target.text)) {
        return null;
      }
      return {
        type: "dek:picked",
        slug,
        step,
        target: {
          kind: "element",
          path: target.path,
          name: target.name,
          text: target.text.slice(0, 200),
          box,
        },
      };
    }
    case "dek:pick-cancel":
      return { type: "dek:pick-cancel" };
    case "dek:mark":
      return isString(data.id) ? { type: "dek:mark", id: data.id } : null;
    default:
      return null;
  }
}

/** The logical size a deck's slides are laid out at when it does not say: 16:9 at 1280 wide. */
export const DEFAULT_SIZE: Size = { width: 1280, height: 720 };

/** A box in the slide's logical pixels as fractions of the slide, for placing a pin over a picture. */
export function boxToPercent(box: Box, size: Size): Box {
  const clamp = (value: number) => Math.min(100, Math.max(0, value));
  return {
    x: clamp((box.x / size.width) * 100),
    y: clamp((box.y / size.height) * 100),
    width: clamp((box.width / size.width) * 100),
    height: clamp((box.height / size.height) * 100),
  };
}

/** The iframe URL pointed at one slide, by its fragment; only the fragment changes, so no reload. */
export function withSlide(src: string, slug: string): string {
  const hashAt = src.indexOf("#");
  return `${hashAt === -1 ? src : src.slice(0, hashAt)}#${encodeURIComponent(slug)}`;
}

// A server-rendered iframe can speak before the page's script listens: this head script keeps its
// `dek:ready` until then.
export const EARLY_KEY = "__dekEarly";

export type EarlyMessage = { origin: string; source: MessageEventSource | null; data: unknown };

/** For the page's head: keeps the deck's first word until the page's script listens. */
export const EARLY_LISTENER = `window.${EARLY_KEY}=[];addEventListener("message",function(e){var d=e.data;if(d&&typeof d==="object"&&d.type==="dek:ready"&&window.${EARLY_KEY})window.${EARLY_KEY}.push({origin:e.origin,source:e.source,data:d})});`;
