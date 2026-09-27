/// <reference lib="dom" />
import { PAGE_ID } from "../core/page.ts";

import { advance, type DeckStops, positionsEqual } from "../core/position.ts";
import type { PresenterSlide } from "../core/presenter-state.ts";
import { lastStop, type Position, stepKey, stepValuesForBeat } from "../core/step.ts";
import { fitStage } from "./fit.ts";
import { slideSelector } from "./live.ts";
import { createMotion, drawAtEnd, type MotionMode, type SlideModule } from "./motion.ts";
import { type ViewTransitionLike, waitForPlaybackSettle } from "./settle.ts";
import { applyIsShown, applyMorphNames, clearMorphNames, shouldUseViewTransition } from "./step.ts";
import type { DekMotionHandle } from "./window.ts";

export type Stage = {
  slideEl(slug: string | undefined): HTMLElement | undefined;
  /** Mark the slide at `pos` current and show its beats. */
  render(pos: Position): void;
  /** Draw the script of the slide at `pos`. Only the live element animates. */
  showMotion(pos: Position, mode: MotionMode): void;
  /** Play the step from `from` to `to` when it is one beat forward; else jump to its end. */
  showMove(from: Position, to: Position): void;
  /** Draw a clone of `slide` as it stands at `beatIndex`, with no animation. */
  drawStill(clone: HTMLElement, slide: PresenterSlide, beatIndex: number): void;
  /** Run `apply` inside a view transition when the slide changes, and wait until it plays out. */
  present(from: Position, to: Position, apply: () => void): Promise<void>;
  /** Cut the running move short: a newer one is waiting, and the presenter should not. */
  hurry(): void;
  /** Tell a screen reader which slide `pos` is on. */
  announce(pos: Position): void;
  /** Give each slide a page at its last beat while printing; `pos` is drawn again after. */
  setPrinting(on: boolean, pos: Position): void;
  /** Fit the deck to its stage. */
  fit(): void;
  /** What the video recorder seeks. */
  motion: DekMotionHandle;
};

/** Owns the deck's slides on screen: which is current, its beats, morphs, script, and print. */
export function createStage(options: {
  slides: PresenterSlide[];
  deck: DeckStops;
  videoMode: boolean;
}): Stage {
  const { slides } = options;
  const slideModules = (): Record<string, SlideModule> => window.__dekSlides ?? {};
  const motion = createMotion({
    now: () => performance.now(),
    requestFrame: (fn) => requestAnimationFrame(fn),
    cancelFrame: (id) => cancelAnimationFrame(id),
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (id) => window.clearTimeout(id),
  });
  let inFlight: { skipTransition(): void } | undefined;
  let printing = false;

  function slideEl(slug: string | undefined): HTMLElement | undefined {
    if (!slug) {
      return undefined;
    }
    return document.querySelector<HTMLElement>(slideSelector(slug)) ?? undefined;
  }

  function prefersReducedMotion(): boolean {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function showMotion(pos: Position, mode: MotionMode): void {
    const current = slides[pos.slideIndex];
    const el = slideEl(current?.slug);
    if (!current || !el) {
      motion.stop();
      return;
    }
    motion.show(el, slideModules()[current.slug], current.beats, pos.beatIndex, mode);
  }

  function motionModeFor(from: Position, to: Position): MotionMode {
    if (options.videoMode) {
      return "hold";
    }
    if (prefersReducedMotion()) {
      return "final";
    }
    const stepped = advance(from, options.deck);
    return stepped && positionsEqual(stepped, to) ? "animate" : "final";
  }

  function drawStill(clone: HTMLElement, slide: PresenterSlide, beatIndex: number): void {
    drawAtEnd(slideModules()[slide.slug], clone, beatIndex, stepKey(slide.beats, beatIndex));
  }

  /** Read the slides afresh on each draw: live reload may have swapped one. */
  function render(pos: Position): void {
    const slideEls = [...document.querySelectorAll("#deck > .slide")];
    const current = slides[pos.slideIndex];
    const currentEl = slideEl(current?.slug);
    for (const el of slideEls) {
      el.classList.toggle("is-current", el === currentEl);
    }
    const shown = current ? stepValuesForBeat(current.beats, pos.beatIndex) : new Set<string>();
    if (currentEl) {
      applyIsShown([...currentEl.querySelectorAll("[data-step]")], shown);
      applyMorphNames([...currentEl.querySelectorAll<HTMLElement>("[data-morph]")]);
    }
    for (const el of slideEls) {
      if (el !== currentEl) {
        clearMorphNames([...el.querySelectorAll<HTMLElement>("[data-morph]")]);
      }
    }
  }

  async function present(from: Position, to: Position, apply: () => void): Promise<void> {
    let viewTransition: ViewTransitionLike | undefined;
    if (
      shouldUseViewTransition(from.slideIndex, to.slideIndex) &&
      "startViewTransition" in document &&
      !prefersReducedMotion()
    ) {
      const fromEl = slideEl(slides[from.slideIndex]?.slug);
      if (fromEl) {
        applyMorphNames([...fromEl.querySelectorAll<HTMLElement>("[data-morph]")]);
      }
      const started = document.startViewTransition(apply);
      viewTransition = started;
      inFlight = started;
    } else {
      apply();
    }
    try {
      await waitForPlaybackSettle({ animations: [...document.getAnimations()], viewTransition });
    } finally {
      inFlight = undefined;
    }
  }

  function hurry(): void {
    if (options.videoMode) {
      return;
    }
    inFlight?.skipTransition();
    for (const animation of document.getAnimations()) {
      const end = animation.effect?.getComputedTiming().endTime;
      if (animation.playState === "running" && typeof end === "number" && Number.isFinite(end)) {
        animation.finish();
      }
    }
  }

  /** Beats within a slide pass quietly. */
  function announce(pos: Position): void {
    const el = document.getElementById(PAGE_ID.announce);
    const slide = slides[pos.slideIndex];
    if (el && slide) {
      el.textContent = `Slide ${pos.slideIndex + 1} of ${slides.length}: ${slide.title}`;
    }
  }

  /**
   * Print gives each slide a page at its last beat, as `dek pdf` does, so each slide's script
   * draws that beat's end the way the PDF page draws it. Once printed, the stage draws its own
   * beat again. The browser tells of a print twice (beforeprint and the print media query), and
   * a PDF export only the second way; each change is drawn once.
   */
  function setPrinting(on: boolean, pos: Position): void {
    if (on === printing) {
      return;
    }
    printing = on;
    if (!on) {
      render(pos);
      showMotion(pos, "final");
      return;
    }
    motion.stop();
    for (const slide of slides) {
      const el = slideEl(slide.slug);
      if (el) {
        const last = lastStop(slide.beats);
        applyIsShown([...el.querySelectorAll("[data-step]")], stepValuesForBeat(slide.beats, last));
        drawStill(el, slide, last);
      }
    }
  }

  function fit(): void {
    const deckEl = document.getElementById(PAGE_ID.deck);
    const currentStage = document.getElementById(PAGE_ID.currentStage);
    if (deckEl instanceof HTMLElement && currentStage) {
      fitStage(deckEl, currentStage);
    }
  }

  return {
    slideEl,
    render,
    showMotion,
    showMove: (from, to) => showMotion(to, motionModeFor(from, to)),
    drawStill,
    present,
    hurry,
    announce,
    setPrinting,
    fit,
    motion: {
      duration: () => motion.duration(),
      seek: (t: number) => motion.seek(t),
    },
  };
}
