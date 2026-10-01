/// <reference lib="dom" />
import { PAGE_ID } from "../core/page.ts";

import { advance, type DeckStops, positionsEqual } from "../core/position.ts";
import type { PresenterSlide } from "../core/presenter-state.ts";
import { lastStop, type Position, stepKey, stepValuesForBeat } from "../core/step.ts";
import { fitStage } from "./fit.ts";
import { slideSelector } from "./live.ts";
import { createMotion, drawAtEnd, type MotionMode, type SlideModule } from "./motion.ts";
import { waitForPlaybackSettle } from "./settle.ts";
import { applyIsShown, applyMorphNames, clearMorphNames, shouldUseViewTransition } from "./step.ts";
import type { DekcMotionHandle } from "./window.ts";

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
  motion: DekcMotionHandle;
};

/** How the script draws a move: one beat forward animates, anything else jumps to its end. */
export function motionModeFor(
  from: Position,
  to: Position,
  deck: DeckStops,
  env: { videoMode: boolean; reducedMotion: boolean },
): MotionMode {
  if (env.videoMode) {
    return "hold";
  }
  if (env.reducedMotion) {
    return "final";
  }
  const stepped = advance(from, deck);
  return stepped && positionsEqual(stepped, to) ? "animate" : "final";
}

/** What a screen reader hears on arriving at `pos`. */
export function announcement(
  slides: ReadonlyArray<{ title: string }>,
  pos: Position,
): string | undefined {
  const slide = slides[pos.slideIndex];
  return slide ? `Slide ${pos.slideIndex + 1} of ${slides.length}: ${slide.title}` : undefined;
}

/** Only a running animation with an end can be finished; an endless one would throw. */
export function isFinishable(animation: {
  playState: string;
  effect: { getComputedTiming(): { endTime?: unknown } } | null;
}): boolean {
  const end = animation.effect?.getComputedTiming().endTime;
  return animation.playState === "running" && typeof end === "number" && Number.isFinite(end);
}

const slideModules = (): Record<string, SlideModule> => window.__dekcSlides ?? {};

function slideEl(slug: string | undefined): HTMLElement | undefined {
  if (!slug) {
    return undefined;
  }
  return document.querySelector<HTMLElement>(slideSelector(slug)) ?? undefined;
}

function prefersReducedMotion(): boolean {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const morphEls = (el: Element): HTMLElement[] => [
  ...el.querySelectorAll<HTMLElement>("[data-morph]"),
];

function drawStill(clone: HTMLElement, slide: PresenterSlide, beatIndex: number): void {
  drawAtEnd(slideModules()[slide.slug], clone, beatIndex, stepKey(slide.beats, beatIndex));
}

/** Read the slides afresh on each draw: live reload may have swapped one. */
function renderSlides(slides: PresenterSlide[], pos: Position): void {
  const slideEls = [...document.querySelectorAll("#deck > .slide")];
  const current = slides[pos.slideIndex];
  const currentEl = slideEl(current?.slug);
  for (const el of slideEls) {
    el.classList.toggle("is-current", el === currentEl);
  }
  const shown = current ? stepValuesForBeat(current.beats, pos.beatIndex) : new Set<string>();
  if (currentEl) {
    applyIsShown([...currentEl.querySelectorAll("[data-step]")], shown);
    applyMorphNames(morphEls(currentEl));
  }
  for (const el of slideEls) {
    if (el !== currentEl) {
      clearMorphNames(morphEls(el));
    }
  }
}

/** Each slide at its last beat, as `dekc pdf` gives it a page. */
function drawPrintPages(slides: PresenterSlide[]): void {
  for (const slide of slides) {
    const el = slideEl(slide.slug);
    if (el) {
      const last = lastStop(slide.beats);
      applyIsShown([...el.querySelectorAll("[data-step]")], stepValuesForBeat(slide.beats, last));
      drawStill(el, slide, last);
    }
  }
}

/**
 * Start a view transition that runs `apply` when the move changes slide and the browser and
 * viewer allow one; else run `apply` now.
 */
function startTransition(
  slides: PresenterSlide[],
  from: Position,
  to: Position,
  apply: () => void,
): ViewTransition | undefined {
  if (
    !shouldUseViewTransition(from.slideIndex, to.slideIndex) ||
    !("startViewTransition" in document) ||
    prefersReducedMotion()
  ) {
    apply();
    return undefined;
  }
  const fromEl = slideEl(slides[from.slideIndex]?.slug);
  if (fromEl) {
    applyMorphNames(morphEls(fromEl));
  }
  return document.startViewTransition(apply);
}

function finishAnimations(): void {
  for (const animation of document.getAnimations()) {
    if (isFinishable(animation)) {
      animation.finish();
    }
  }
}

function fitDeck(): void {
  const deckEl = document.getElementById(PAGE_ID.deck);
  const currentStage = document.getElementById(PAGE_ID.currentStage);
  if (deckEl instanceof HTMLElement && currentStage) {
    fitStage(deckEl, currentStage);
  }
}

/** Owns the deck's slides on screen: which is current, its beats, morphs, script, and print. */
export function createStage(options: {
  slides: PresenterSlide[];
  deck: DeckStops;
  videoMode: boolean;
}): Stage {
  const { slides, videoMode } = options;
  const motion = createMotion({
    now: () => performance.now(),
    requestFrame: (fn) => requestAnimationFrame(fn),
    cancelFrame: (id) => cancelAnimationFrame(id),
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (id) => window.clearTimeout(id),
  });
  let inFlight: { skipTransition(): void } | undefined;
  let printing = false;

  function showMotion(pos: Position, mode: MotionMode): void {
    const current = slides[pos.slideIndex];
    const el = slideEl(current?.slug);
    if (!current || !el) {
      motion.stop();
      return;
    }
    motion.show(el, slideModules()[current.slug], current.beats, pos.beatIndex, mode);
  }

  async function present(from: Position, to: Position, apply: () => void): Promise<void> {
    const viewTransition = startTransition(slides, from, to, apply);
    if (viewTransition) {
      inFlight = viewTransition;
    }
    try {
      await waitForPlaybackSettle({ animations: [...document.getAnimations()], viewTransition });
    } finally {
      inFlight = undefined;
    }
  }

  /**
   * Print gives each slide a page at its last beat, as `dekc pdf` does, so each slide's script
   * draws that beat's end the way the PDF page draws it. Once printed, the stage draws its own
   * beat again. The browser tells of a print twice (beforeprint and the print media query), and
   * a PDF export only the second way; each change is drawn once.
   */
  function setPrinting(on: boolean, pos: Position): void {
    if (on === printing) {
      return;
    }
    printing = on;
    if (on) {
      motion.stop();
      drawPrintPages(slides);
    } else {
      renderSlides(slides, pos);
      showMotion(pos, "final");
    }
  }

  return {
    slideEl,
    render: (pos) => renderSlides(slides, pos),
    showMotion,
    showMove: (from, to) =>
      showMotion(
        to,
        motionModeFor(from, to, options.deck, { videoMode, reducedMotion: prefersReducedMotion() }),
      ),
    drawStill,
    present,
    hurry() {
      if (videoMode) {
        return;
      }
      inFlight?.skipTransition();
      finishAnimations();
    },
    /** Beats within a slide pass quietly. */
    announce(pos) {
      const el = document.getElementById(PAGE_ID.announce);
      const text = announcement(slides, pos);
      if (el && text !== undefined) {
        el.textContent = text;
      }
    },
    setPrinting,
    fit: fitDeck,
    motion: {
      duration: () => motion.duration(),
      seek: (t: number) => motion.seek(t),
    },
  };
}
