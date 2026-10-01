/// <reference lib="dom" />
import { PAGE_ID } from "../core/page.ts";

import type { PresenterSlide } from "../core/presenter-state.ts";
import { lastStop } from "../core/step.ts";
import { deckSize, stillFrame, visualClone } from "./clone.ts";
import { fitStage } from "./fit.ts";
import {
  clampRailWidth,
  pageStorage,
  RAIL_VISIBLE_KEY,
  RAIL_WIDTH_KEY,
  RAIL_WIDTH_STEP,
  readStoredRailVisible,
  readStoredRailWidth,
} from "./rail.ts";
import type { Stage } from "./stage.ts";

export type RailView = {
  /** Whether the page has a rail. */
  available(): boolean;
  isOpen(): boolean;
  setOpen(open: boolean): void;
  /** Draw every thumbnail again from its slide. */
  fill(): void;
  fit(): void;
  /** Mark the thumbnail of slide `slideIndex` current and scroll it into view. */
  markCurrent(slideIndex: number): void;
};

/** Which way an arrow key on a thumbnail moves along the rail. */
export function thumbStep(key: string): 1 | -1 | undefined {
  if (key === "ArrowDown") {
    return 1;
  }
  return key === "ArrowUp" ? -1 : undefined;
}

/** How far an arrow key on the resize handle moves the rail's edge. */
export function resizeStep(key: string): number | undefined {
  if (key === "ArrowRight") {
    return RAIL_WIDTH_STEP;
  }
  return key === "ArrowLeft" ? -RAIL_WIDTH_STEP : undefined;
}

function persist(key: string, value: string): void {
  try {
    pageStorage()?.setItem(key, value);
  } catch {
    // file:// or private mode may reject storage
  }
}

function setWidth(handle: HTMLElement | null, px: number): number {
  const width = clampRailWidth(px);
  document.documentElement.style.setProperty("--dek-rail-w", `${width}px`);
  handle?.setAttribute("aria-valuenow", String(width));
  return width;
}

function fillThumbs(railEl: HTMLElement, slides: PresenterSlide[], stage: Stage): void {
  const deckEl = document.getElementById(PAGE_ID.deck);
  if (!deckEl) {
    return;
  }
  const size = deckSize(deckEl);
  for (const [index, slide] of slides.entries()) {
    const frame = railEl.querySelector(`[data-slide-index="${index}"] .dek-thumb-frame`);
    if (!(frame instanceof HTMLElement)) {
      continue;
    }
    const source = stage.slideEl(slide.slug);
    const clone = source ? visualClone(source) : undefined;
    if (!clone) {
      frame.replaceChildren();
      continue;
    }
    const thumbStage = stillFrame("dek-thumb-stage", clone, size);
    frame.replaceChildren(thumbStage);
    // Drawn once in the document, so a script that measures its slide gets real boxes. The
    // rail shows every beat's elements, so the script draws the last beat to match them.
    stage.drawStill(clone, slide, lastStop(slide.beats));
    fitStage(thumbStage, frame);
  }
}

function fitThumbs(railEl: HTMLElement): void {
  if (railEl.offsetParent === null) {
    return;
  }
  for (const frame of railEl.querySelectorAll(".dek-thumb-frame")) {
    const thumbStage = frame.querySelector(".dek-thumb-stage");
    if (frame instanceof HTMLElement && thumbStage instanceof HTMLElement) {
      fitStage(thumbStage, frame);
    }
  }
}

function markCurrent(railEl: HTMLElement, slideIndex: number): void {
  for (const el of railEl.querySelectorAll(".dek-thumb")) {
    const current = Number(el.getAttribute("data-slide-index")) === slideIndex;
    el.classList.toggle("is-current", current);
    if (current) {
      el.setAttribute("aria-current", "page");
      el.scrollIntoView({ block: "nearest" });
    } else {
      el.removeAttribute("aria-current");
    }
  }
}

/** Arrow keys on a thumbnail pick the slide next to it, and focus follows. */
function bindThumbKeys(
  railEl: HTMLElement,
  slides: PresenterSlide[],
  onPick: (slideIndex: number) => void,
): void {
  railEl.addEventListener("keydown", (event) => {
    const step = thumbStep(event.key);
    const thumb = event.target;
    if (!step || !(thumb instanceof HTMLElement) || !thumb.classList.contains("dek-thumb")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const nextIndex = Number(thumb.getAttribute("data-slide-index")) + step;
    if (!slides[nextIndex]) {
      return;
    }
    onPick(nextIndex);
    railEl
      .querySelector<HTMLElement>(`[data-slide-index="${nextIndex}"]`)
      ?.focus({ preventScroll: true });
  });
}

function bindResizeKeys(handle: HTMLElement, onResize: () => void): void {
  handle.addEventListener("keydown", (event) => {
    const step = resizeStep(event.key);
    if (!step) {
      return;
    }
    // The arrows resize the rail here; they must not also move the deck.
    event.preventDefault();
    event.stopPropagation();
    const now = Number(handle.getAttribute("aria-valuenow"));
    persist(RAIL_WIDTH_KEY, String(setWidth(handle, now + step)));
    onResize();
  });
}

/** The rail follows the pointer while it drags, and remembers the width where it lets go. */
function bindResizeDrag(handle: HTMLElement, onResize: () => void): void {
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // synthetic events may not support capture
    }
    handle.setAttribute("data-dragging", "");
    let width = setWidth(handle, event.clientX);
    const move = (ev: PointerEvent): void => {
      width = setWidth(handle, ev.clientX);
      onResize();
    };
    const up = (): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      handle.removeAttribute("data-dragging");
      persist(RAIL_WIDTH_KEY, String(width));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  });
}

/**
 * Owns the slide rail: its thumbnails, its width, and whether it shows. Arrow keys on a thumbnail
 * pick the slide next to it; `onResize` hears each width change, since the deck fits around it.
 */
export function createRailView(options: {
  slides: PresenterSlide[];
  stage: Stage;
  onPick: (slideIndex: number) => void;
  onResize: () => void;
}): RailView {
  const railEl = document.getElementById(PAGE_ID.rail);
  const resizeEl = document.getElementById(PAGE_ID.railResize);

  if (railEl) {
    setWidth(resizeEl, readStoredRailWidth(pageStorage()));
    // What was remembered; the deck is fitted once everything is built.
    document.body.classList.toggle("is-rail-hidden", !readStoredRailVisible(pageStorage()));
    bindThumbKeys(railEl, options.slides, options.onPick);
    if (resizeEl) {
      bindResizeKeys(resizeEl, options.onResize);
      bindResizeDrag(resizeEl, options.onResize);
    }
  }

  return {
    available: () => railEl !== null,
    isOpen: () => !document.body.classList.contains("is-rail-hidden"),
    setOpen(open) {
      document.body.classList.toggle("is-rail-hidden", !open);
      persist(RAIL_VISIBLE_KEY, open ? "1" : "0");
      options.onResize();
    },
    fill() {
      if (railEl) {
        fillThumbs(railEl, options.slides, options.stage);
      }
    },
    fit() {
      if (railEl) {
        fitThumbs(railEl);
      }
    },
    markCurrent(slideIndex) {
      if (railEl) {
        markCurrent(railEl, slideIndex);
      }
    },
  };
}
