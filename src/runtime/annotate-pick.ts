/// <reference lib="dom" />
// What annotate mode can point at: the elements of the slide on screen under the pointer, what
// each is called, and where it is on the slide. Only elements the dev server stamped with where
// they are written count, so every one can be named by its file and line.

import { deckStops, positionFromHash } from "../core/position.ts";
import { type BeatRef, stepKey } from "../core/step.ts";
import type { Box } from "./annotate-notes.ts";

/** The attribute the dev server writes on each start tag of a slide: `<line>:<column>`. */
export const SOURCE_ATTR = "data-dek-source";

/** The classes the dev server saw written on each stamped tag, before any script added more. */
const CLASS_ATTR = "data-dek-class";

/** How long a text may be before it is cut short. */
const TEXT_MAX = 40;

type Point = { x: number; y: number };

/**
 * The points tried around the pointer: the pointer itself first, then rings out to a few pixels,
 * so a line one pixel thick is found from beside it as well as on it.
 */
export function ringPoints(at: Point): Point[] {
  const points = [at];
  for (let radius = 1; radius <= 5; radius++) {
    for (let step = 0; step < 8; step++) {
      const angle = (step * Math.PI) / 4;
      points.push({ x: at.x + radius * Math.cos(angle), y: at.y + radius * Math.sin(angle) });
    }
  }
  return points;
}

/**
 * The elements of `slide` that can be picked at `at`: what is under the pointer, then what is
 * only near it, each before anything it is inside, and the slide itself last. A line beside the
 * pointer so comes before the drawing it is in, which is under the pointer and easy to hit.
 * `elementsAt` is the document's `elementsFromPoint`, every element at a point, topmost first.
 */
export function candidatesAt(
  at: Point,
  slide: Element,
  elementsAt: (x: number, y: number) => readonly Element[],
): Element[] {
  const found: Element[] = [];
  for (const point of ringPoints(at)) {
    for (const el of elementsAt(point.x, point.y)) {
      if (el === slide || found.includes(el) || !isCandidate(el, slide)) {
        continue;
      }
      const outer = found.findIndex((other) => other.contains(el));
      found.splice(outer < 0 ? found.length : outer, 0, el);
    }
  }
  return isCandidate(slide, slide) ? [...found, slide] : found;
}

function isCandidate(el: Element, slide: Element): boolean {
  return el.hasAttribute(SOURCE_ATTR) && slide.contains(el) && isShown(el, slide);
}

/** Whether `el` shows: neither it nor anything it is in on the slide is transparent or hidden. */
function isShown(el: Element, slide: Element): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) {
    return true;
  }
  if (view.getComputedStyle(el).visibility === "hidden") {
    return false;
  }
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (view.getComputedStyle(node).opacity === "0") {
      return false;
    }
    if (node === slide) {
      break;
    }
  }
  return true;
}

/**
 * What a note says an element is: where it is written, its tag and its classes as written, and
 * its text cut short. The classes the player or a slide script added since, such as
 * `is-current`, are in no file to find. The slide's text is the whole slide, which names
 * nothing, so it has none.
 */
export function describeElement(
  el: Element,
  slide: Element,
): { source: string; name: string; text: string } {
  const classes = (el.getAttribute(CLASS_ATTR) ?? "").split(" ").filter(Boolean);
  const text = el === slide ? "" : (el.textContent ?? "").replace(/\s+/g, " ").trim();
  return {
    source: el.getAttribute(SOURCE_ATTR) ?? "",
    name: [el.tagName.toLowerCase(), ...classes].join("."),
    text: text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX)}…` : text,
  };
}

/** Where `el` is on the slide, in the slide's own pixels, whatever the stage scales it to. */
export function slideBox(el: Element, deck: HTMLElement): Box {
  const scale = deckScale(deck);
  const origin = deck.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  return {
    x: Math.round((rect.left - origin.left) / scale),
    y: Math.round((rect.top - origin.top) / scale),
    width: Math.round(rect.width / scale),
    height: Math.round(rect.height / scale),
  };
}

/** A point in the window as a point on the slide, in the slide's own pixels. */
export function slidePoint(at: Point, deck: HTMLElement): Point {
  const scale = deckScale(deck);
  const origin = deck.getBoundingClientRect();
  return {
    x: Math.round((at.x - origin.left) / scale),
    y: Math.round((at.y - origin.top) / scale),
  };
}

/** A point on the slide, in its own pixels, as a point in the window. */
export function windowPoint(at: Point, deck: HTMLElement): Point {
  const scale = deckScale(deck);
  const origin = deck.getBoundingClientRect();
  return { x: origin.left + at.x * scale, y: origin.top + at.y * scale };
}

function deckScale(deck: HTMLElement): number {
  const width = deck.getBoundingClientRect().width;
  return deck.offsetWidth > 0 && width > 0 ? width / deck.offsetWidth : 1;
}

/** The slide on screen and its beat, as the hash says and `dekc shot --step` takes it. */
export function currentStop(
  hash: string,
  slides: ReadonlyArray<{ slug: string; beats: BeatRef[] }>,
): { slideIndex: number; step: string } {
  const pos = positionFromHash(hash, deckStops(slides));
  return {
    slideIndex: pos.slideIndex,
    step: stepKey(slides[pos.slideIndex]?.beats ?? [], pos.beatIndex),
  };
}
