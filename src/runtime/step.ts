import type { Position } from "../core/step.ts";

export type StepElement = {
  getAttribute(name: string): string | null;
  classList: { toggle(name: string, force?: boolean): void };
};

export type MorphElement = {
  getAttribute(name: string): string | null;
  style: { setProperty(name: string, value: string): void; removeProperty(name: string): string };
};

export function applyIsShown(elements: StepElement[], shown: Set<string>): void {
  for (const el of elements) {
    const step = el.getAttribute("data-step");
    el.classList.toggle("is-shown", step !== null && shown.has(step));
  }
}

export function advance(pos: Position, slideBeatCounts: number[]): Position | null {
  const count = slideBeatCounts[pos.slideIndex];
  if (count === undefined) {
    return null;
  }
  if (pos.beatIndex + 1 < count) {
    return { slideIndex: pos.slideIndex, beatIndex: pos.beatIndex + 1 };
  }
  const nextSlide = pos.slideIndex + 1;
  if (nextSlide >= slideBeatCounts.length) {
    return null;
  }
  return { slideIndex: nextSlide, beatIndex: 0 };
}

export function retreat(pos: Position, slideBeatCounts: number[]): Position | null {
  if (pos.beatIndex > 0) {
    return { slideIndex: pos.slideIndex, beatIndex: pos.beatIndex - 1 };
  }
  const prevSlide = pos.slideIndex - 1;
  if (prevSlide < 0) {
    return null;
  }
  const prevCount = slideBeatCounts[prevSlide] ?? 0;
  return { slideIndex: prevSlide, beatIndex: Math.max(prevCount - 1, 0) };
}

export type Move = "advance" | "retreat" | "first" | "last";

export type MoveKey = {
  key: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
};

/**
 * The move a key asks for. Clickers send the arrow and page keys; Space goes forward and
 * Shift+Space back, as on a web page. Chords with Alt, Ctrl, or Cmd belong to the browser
 * (Alt+← is Back), so they never move the deck.
 */
export function keyToMove(event: MoveKey): Move | null {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return null;
  }
  switch (event.key) {
    case " ":
      return event.shiftKey ? "retreat" : "advance";
    case "ArrowRight":
    case "PageDown":
      return "advance";
    case "ArrowLeft":
    case "PageUp":
    case "Backspace":
      return "retreat";
    case "Home":
      return "first";
    case "End":
      return "last";
    default:
      return null;
  }
}

/** Where `move` leads from `pos`, or null at either end of the talk. */
export function moveTarget(move: Move, pos: Position, slideBeatCounts: number[]): Position | null {
  switch (move) {
    case "advance":
      return advance(pos, slideBeatCounts);
    case "retreat":
      return retreat(pos, slideBeatCounts);
    case "first":
      return slideBeatCounts.length > 0 ? { slideIndex: 0, beatIndex: 0 } : null;
    case "last": {
      const slideIndex = slideBeatCounts.length - 1;
      if (slideIndex < 0) {
        return null;
      }
      return { slideIndex, beatIndex: Math.max((slideBeatCounts[slideIndex] ?? 0) - 1, 0) };
    }
  }
}

/**
 * Whether `event` is the bare letter key `letter`, either case: no Alt, Ctrl, or Cmd, which
 * belong to the browser, and no auto-repeat, which would toggle on and off while held.
 */
export function isLetterKey(
  event: { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; repeat?: boolean },
  letter: string,
): boolean {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) {
    return false;
  }
  return event.key.toLowerCase() === letter;
}

/** A finished touch on the slide: where it lifted, and how far it travelled from where it began. */
export type PointerStroke = { x: number; y: number; dx: number; dy: number };

/**
 * The move a touch asks for. A swipe turns the page as a book does (leftward goes forward);
 * a tap goes forward, except on the left third, which goes back. Anything between, such as a
 * vertical scroll or a short drag, is not a move.
 */
export function pointerMove(stroke: PointerStroke, stage: { width: number }): Move | null {
  const ax = Math.abs(stroke.dx);
  const ay = Math.abs(stroke.dy);
  if (ax >= SWIPE_MIN_PX && ax > ay * 2) {
    return stroke.dx < 0 ? "advance" : "retreat";
  }
  if (ax < TAP_MAX_PX && ay < TAP_MAX_PX) {
    return stroke.x < stage.width / 3 ? "retreat" : "advance";
  }
  return null;
}

const SWIPE_MIN_PX = 60;
const TAP_MAX_PX = 10;

/** Whether a touch on `target` belongs to it (a link, a control, media) rather than to the deck. */
export function isInteractive(target: unknown): boolean {
  const el = target as { closest?: (selector: string) => unknown } | null;
  return typeof el?.closest === "function" && el.closest(INTERACTIVE) !== null;
}

const INTERACTIVE =
  "a[href], button, input, textarea, select, label, summary, video, audio, [contenteditable]";

/** Whether keys pressed on `target` are typing: a field or editable text on a slide. */
export function isTextEntry(target: unknown): boolean {
  if (typeof target !== "object" || target === null) {
    return false;
  }
  const el = target as { tagName?: unknown; isContentEditable?: unknown };
  return (
    el.isContentEditable === true ||
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT"
  );
}

export function applyMorphNames(elements: MorphElement[]): void {
  for (const el of elements) {
    const name = el.getAttribute("data-morph");
    if (name) {
      // The browser reads the CSS property; an attribute of the same name does nothing.
      el.style.setProperty("view-transition-name", name);
    }
  }
}

export function clearMorphNames(elements: MorphElement[]): void {
  for (const el of elements) {
    el.style.removeProperty("view-transition-name");
  }
}

export function shouldUseViewTransition(fromSlide: number, toSlide: number): boolean {
  return fromSlide !== toSlide;
}
