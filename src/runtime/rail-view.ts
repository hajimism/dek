/// <reference lib="dom" />
import { PAGE_ID } from "../core/page.ts";

import type { PresenterSlide } from "../core/presenter-state.ts";
import { lastStop } from "../core/step.ts";
import { visualClone } from "./clone.ts";
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
  const { slides, stage } = options;
  const railEl = document.getElementById(PAGE_ID.rail);
  const resizeEl = document.getElementById(PAGE_ID.railResize);

  function persist(key: string, value: string): void {
    try {
      pageStorage()?.setItem(key, value);
    } catch {
      // file:// or private mode may reject storage
    }
  }

  function setWidth(px: number): number {
    const width = clampRailWidth(px);
    document.documentElement.style.setProperty("--dek-rail-w", `${width}px`);
    resizeEl?.setAttribute("aria-valuenow", String(width));
    return width;
  }

  function setOpen(open: boolean): void {
    document.body.classList.toggle("is-rail-hidden", !open);
    persist(RAIL_VISIBLE_KEY, open ? "1" : "0");
    options.onResize();
  }

  function fill(): void {
    const deckEl = document.getElementById(PAGE_ID.deck);
    if (!railEl || !deckEl) {
      return;
    }
    const width = deckEl.offsetWidth || 1280;
    const height = deckEl.offsetHeight || 720;
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
      const thumbStage = document.createElement("div");
      thumbStage.className = "dek-thumb-stage";
      thumbStage.style.width = `${width}px`;
      thumbStage.style.height = `${height}px`;
      thumbStage.append(clone);
      frame.replaceChildren(thumbStage);
      // Drawn once in the document, so a script that measures its slide gets real boxes. The
      // rail shows every beat's elements, so the script draws the last beat to match them.
      stage.drawStill(clone, slide, lastStop(slide.beats));
      fitStage(thumbStage, frame);
    }
  }

  function fit(): void {
    if (!railEl || railEl.offsetParent === null) {
      return;
    }
    for (const frame of railEl.querySelectorAll(".dek-thumb-frame")) {
      if (!(frame instanceof HTMLElement)) {
        continue;
      }
      const thumbStage = frame.querySelector(".dek-thumb-stage");
      if (thumbStage instanceof HTMLElement) {
        fitStage(thumbStage, frame);
      }
    }
  }

  function markCurrent(slideIndex: number): void {
    if (!railEl) {
      return;
    }
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

  if (railEl) {
    setWidth(readStoredRailWidth(pageStorage()));
    // What was remembered; the deck is fitted once everything is built.
    document.body.classList.toggle("is-rail-hidden", !readStoredRailVisible(pageStorage()));
    railEl.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
        return;
      }
      const thumb = event.target;
      if (!(thumb instanceof HTMLElement) || !thumb.classList.contains("dek-thumb")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const index = Number(thumb.getAttribute("data-slide-index"));
      const nextIndex = index + (event.key === "ArrowDown" ? 1 : -1);
      if (!slides[nextIndex]) {
        return;
      }
      options.onPick(nextIndex);
      const nextThumb = railEl.querySelector(`[data-slide-index="${nextIndex}"]`);
      if (nextThumb instanceof HTMLElement) {
        nextThumb.focus({ preventScroll: true });
      }
    });
    if (resizeEl) {
      bindResize(resizeEl);
    }
  }

  function bindResize(handle: HTMLElement): void {
    handle.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      // The arrows resize the rail here; they must not also move the deck.
      event.preventDefault();
      event.stopPropagation();
      const now = Number(handle.getAttribute("aria-valuenow"));
      const step = event.key === "ArrowRight" ? RAIL_WIDTH_STEP : -RAIL_WIDTH_STEP;
      persist(RAIL_WIDTH_KEY, String(setWidth(now + step)));
      options.onResize();
    });
    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        // synthetic events may not support capture
      }
      handle.setAttribute("data-dragging", "");
      let width = setWidth(event.clientX);
      const move = (ev: PointerEvent): void => {
        width = setWidth(ev.clientX);
        options.onResize();
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

  return {
    available: () => railEl !== null,
    isOpen: () => !document.body.classList.contains("is-rail-hidden"),
    setOpen,
    fill,
    fit,
    markCurrent,
  };
}
