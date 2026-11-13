/// <reference lib="dom" />
// What annotate mode can point at: the elements of the slide on screen under the pointer, what
// each is called, and where it is on the slide. Only elements the dev server stamped with where
// they are written count, so every one can be named by its file and line.

import { type Box, cutText } from "../core/annotation-rows.ts";
import { deckStops, formatHash, positionFromHash } from "../core/position.ts";
import { type BeatRef, lastStop, resolveStop, stepKey } from "../core/step.ts";

/** The attribute the dev server writes on each start tag of a slide: `<line>:<column>`. */
export const SOURCE_ATTR = "data-dek-source";

/** The classes the dev server saw written on each stamped tag, before any script added more. */
const CLASS_ATTR = "data-dek-class";

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

/** Whether the dev server stamped `el` with where it is written: what annotate mode can name. */
export const isStamped = (el: Element): boolean => el.hasAttribute(SOURCE_ATTR);

/**
 * The elements of `slide` that can be picked at `at`: what is under the pointer, then what is
 * only near it, each before anything it is inside, and the slide itself last. A line beside the
 * pointer so comes before the drawing it is in, which is under the pointer and easy to hit.
 * `elementsAt` is the document's `elementsFromPoint`, every element at a point, topmost first.
 * `counts` says which elements may be picked at all: annotate mode takes those stamped with their
 * source (`isStamped`); a build has no stamps, and the embed API takes any.
 */
export function candidatesAt(
  at: Point,
  slide: Element,
  elementsAt: (x: number, y: number) => readonly Element[],
  counts: (el: Element) => boolean,
): Element[] {
  const isCandidate = (el: Element): boolean =>
    counts(el) && slide.contains(el) && isShown(el, slide);
  const found: Element[] = [];
  for (const point of ringPoints(at)) {
    for (const el of elementsAt(point.x, point.y)) {
      if (el === slide || found.includes(el) || !isCandidate(el)) {
        continue;
      }
      const outer = found.findIndex((other) => other.contains(el));
      found.splice(outer < 0 ? found.length : outer, 0, el);
    }
  }
  return isCandidate(slide) ? [...found, slide] : found;
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
  return {
    source: el.getAttribute(SOURCE_ATTR) ?? "",
    name: elementName(el, (el.getAttribute(CLASS_ATTR) ?? "").split(" ").filter(Boolean)),
    text: el === slide ? "" : cutText(el.textContent ?? ""),
  };
}

/** An element as a note names it: its tag, then each of `classes`, as `div.chevron`. */
export function elementName(el: Element, classes: readonly string[]): string {
  return [el.tagName.toLowerCase(), ...classes].join(".");
}

/** Elements whose text is never on screen. */
const UNSHOWN_TAGS = new Set(["STYLE", "SCRIPT", "TEMPLATE", "NOSCRIPT"]);

/**
 * The text of `el` a reader can see on `slide` now: its text nodes, less those in an element that
 * is hidden, transparent, or not laid out, such as a beat not reached yet, or a `<style>`.
 */
export function visibleText(el: Element, slide: Element): string {
  const view = el.ownerDocument.defaultView;
  const seen = new Map<Element, boolean>();
  const shows = (parent: Element): boolean => {
    const known = seen.get(parent);
    if (known !== undefined) {
      return known;
    }
    let shown = !UNSHOWN_TAGS.has(parent.tagName) && isShown(parent, slide);
    for (let node: Element | null = parent; shown && node; node = node.parentElement) {
      if (UNSHOWN_TAGS.has(node.tagName) || view?.getComputedStyle(node).display === "none") {
        shown = false;
      }
      if (node === el || node === slide) {
        break;
      }
    }
    seen.set(parent, shown);
    return shown;
  };
  const walker = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  let text = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (parent && shows(parent)) {
      text += node.nodeValue ?? "";
    }
  }
  return text;
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

/**
 * The hash that shows `slug` at `step`, the stop a note was written at: its last beat once a
 * beat by number is past the slide's last, as a typed hash goes; the slide as it arrives once a
 * beat by id is gone from the script; and nothing once the slide is.
 */
export function stopHash(
  slug: string,
  step: string,
  slides: ReadonlyArray<{ slug: string; beats: BeatRef[] }>,
): string {
  const slideIndex = slides.findIndex((slide) => slide.slug === slug);
  const slide = slides[slideIndex];
  if (!slide) {
    return "";
  }
  return formatHash(
    {
      slideIndex,
      beatIndex: resolveStop(slide.beats, step) ?? (/^\d+$/.test(step) ? lastStop(slide.beats) : 0),
    },
    slides.map((each) => each.slug),
  );
}
