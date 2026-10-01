/// <reference lib="dom" />
import { PAGE_ID, type PageMode } from "../core/page.ts";

import { advance, type DeckStops } from "../core/position.ts";
import {
  nextPresenterTitle,
  type PresenterBeat,
  type PresenterSlide,
  presenterState,
} from "../core/presenter-state.ts";
import { type Position, stepValuesForBeat } from "../core/step.ts";
import { formatClock } from "../core/timing.ts";
import { deckSize, stillFrame, visualClone } from "./clone.ts";
import { fitStage } from "./fit.ts";
import { elapsedTone, presenterSearch, progressFill, totalBudgetSeconds } from "./presenter.ts";
import type { Stage } from "./stage.ts";
import { applyIsShown } from "./step.ts";

export type PresenterView = {
  /** Whether the page can show the presenter at all. */
  available(): boolean;
  isOpen(): boolean;
  /** Show or hide the presenter and keep `?presenter` in the URL to match. */
  setOpen(open: boolean): void;
  render(pos: Position): void;
  /** Start the talk clock once, at the first move. */
  startClock(): void;
  /** Fit the next-beat preview to its stage. */
  fit(): void;
};

/** What the panels say at a position, before any of it is written to the page. */
export type PresenterPanels = {
  /** Undefined off the deck, where the panel keeps what it last said. */
  script: string | undefined;
  /** The title of what the next beat shows. */
  next: string;
  /** Null at the deck's last beat. */
  nextPos: Position | null;
  beats: PresenterBeat[] | undefined;
  budget: string;
};

export function presenterPanels(
  slides: PresenterSlide[],
  deck: DeckStops,
  pos: Position,
): PresenterPanels {
  const current = slides[pos.slideIndex];
  const state = current ? presenterState(slides, pos) : undefined;
  return {
    script: state?.script,
    next: state ? nextPresenterTitle(state) : "",
    nextPos: advance(pos, deck),
    beats: state?.current.beats,
    budget: current?.budgetSeconds !== undefined ? formatClock(current.budgetSeconds) : "",
  };
}

/** One bar segment per slide: done, current and filled as far as its beats go, or to come. */
export function progressSegments(
  deck: DeckStops,
  pos: Position,
): Array<{ className?: "is-done" | "is-current"; fill?: string }> {
  return deck.map((slide, index) => {
    if (index < pos.slideIndex) {
      return { className: "is-done" };
    }
    if (index === pos.slideIndex) {
      return {
        className: "is-current",
        fill: `${progressFill(pos.beatIndex, slide.stops) * 100}%`,
      };
    }
    return {};
  });
}

/** The presenter page opens with its panels shown, and so does any page asked `?presenter`. */
export function opensAsPresenter(search: string, mode: PageMode): boolean {
  return new URLSearchParams(search).has("presenter") || mode === "presenter";
}

const setText = (id: string, text: string): void => {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
};

/** The script, what comes next, and the slide's budget. */
function renderNotes(panels: PresenterPanels, budgetEl: HTMLElement | null): void {
  if (panels.script !== undefined) {
    setText(PAGE_ID.script, panels.script);
  }
  setText(PAGE_ID.next, panels.next);
  const nextEnd = document.getElementById(PAGE_ID.nextEnd);
  if (nextEnd) {
    nextEnd.hidden = Boolean(panels.nextPos);
  }
  if (budgetEl) {
    budgetEl.textContent = panels.budget;
  }
}

function renderPage(slideNumber: number, slideCount: number): void {
  const pageEl = document.getElementById(PAGE_ID.page);
  if (!pageEl) {
    return;
  }
  const total = document.createElement("span");
  total.className = "dekc-page-total";
  total.textContent = `/ ${slideCount}`;
  pageEl.replaceChildren(document.createTextNode(`${slideNumber} `), total);
}

function beatItems(beats: PresenterBeat[]): HTMLLIElement[] {
  return beats.map((beat, i) => {
    const li = document.createElement("li");
    li.setAttribute("data-beat-index", String(i + 1));
    li.textContent = beat.title;
    return li;
  });
}

function highlightBeat(beatsEl: HTMLElement, beatIndex: number): void {
  for (const el of beatsEl.querySelectorAll("[data-beat-index]")) {
    el.classList.toggle(
      "is-current-beat",
      Number(el.getAttribute("data-beat-index")) === beatIndex,
    );
  }
}

function renderProgress(progressEl: HTMLElement, deck: DeckStops, pos: Position): void {
  progressEl.replaceChildren(
    ...progressSegments(deck, pos).map(({ className, fill }) => {
      const span = document.createElement("span");
      if (className) {
        span.className = className;
      }
      if (fill) {
        span.style.setProperty("--dekc-fill", fill);
      }
      return span;
    }),
  );
}

/** A still of the next beat as the move will show it, or nothing when there is none to show. */
function renderNextPreview(
  stage: Stage,
  next: { slide: PresenterSlide; beatIndex: number } | undefined,
): void {
  const previewStage = document.getElementById(PAGE_ID.nextStage);
  if (!previewStage) {
    return;
  }
  const source = next ? stage.slideEl(next.slide.slug) : undefined;
  const clone = source ? visualClone(source) : undefined;
  const deckEl = document.getElementById(PAGE_ID.deck);
  if (!next || !clone || !deckEl) {
    previewStage.replaceChildren();
    return;
  }
  const { slide, beatIndex } = next;
  applyIsShown(
    [...clone.querySelectorAll("[data-step]")],
    stepValuesForBeat(slide.beats, beatIndex),
  );
  const frame = stillFrame("dekc-preview-frame", clone, deckSize(deckEl));
  previewStage.replaceChildren(frame);
  stage.drawStill(clone, slide, beatIndex);
  fitStage(frame, previewStage);
}

function syncElapsed(
  elapsedEl: HTMLElement,
  startedAt: number,
  talkBudget: number | undefined,
): void {
  const elapsed = (Date.now() - startedAt) / 1000;
  elapsedEl.textContent = formatClock(elapsed);
  const tone = elapsedTone(elapsed, talkBudget);
  elapsedEl.classList.toggle("is-warn", tone === "warn");
  elapsedEl.classList.toggle("is-over", tone === "over");
}

/** Owns the presenter's panels: the script, the beats, what comes next, the clock, the progress. */
export function createPresenterView(options: {
  slides: PresenterSlide[];
  deck: DeckStops;
  stage: Stage;
  /** The page opens with the panels shown when it is the presenter page. */
  mode: PageMode;
}): PresenterView {
  const { slides, deck, stage } = options;
  // Only a page with notes has the panels.
  const root = document.getElementById(PAGE_ID.presenter);
  const progressEl = document.getElementById(PAGE_ID.progress);
  const elapsedEl = document.getElementById(PAGE_ID.elapsed);
  const budgetEl = document.getElementById(PAGE_ID.budget);
  const talkBudget = totalBudgetSeconds(slides);
  let startedAt: number | undefined;
  /** The slide the beat list was built for; beats within it only move the highlight. */
  let beatsFor: number | undefined;

  const isOpen = (): boolean => Boolean(root && !root.hidden);

  function show(open: boolean): void {
    if (!root) {
      return;
    }
    root.hidden = !open;
    document.body.classList.toggle("is-presenter", open);
    if (progressEl) {
      progressEl.hidden = !open;
    }
  }

  if (root && opensAsPresenter(location.search, options.mode)) {
    show(true);
  }

  function renderBeatList(pos: Position, beats: PresenterBeat[]): void {
    const beatsEl = document.getElementById(PAGE_ID.beats);
    if (!beatsEl) {
      return;
    }
    if (beatsFor !== pos.slideIndex) {
      beatsFor = pos.slideIndex;
      beatsEl.replaceChildren(...beatItems(beats));
    }
    highlightBeat(beatsEl, pos.beatIndex);
  }

  function render(pos: Position): void {
    const panels = presenterPanels(slides, deck, pos);
    renderNotes(panels, budgetEl);
    if (panels.beats) {
      renderBeatList(pos, panels.beats);
    }
    renderPage(pos.slideIndex + 1, slides.length);
    if (progressEl) {
      renderProgress(progressEl, deck, pos);
    }
    const { nextPos } = panels;
    const nextSlide = nextPos && isOpen() ? slides[nextPos.slideIndex] : undefined;
    renderNextPreview(
      stage,
      nextPos && nextSlide ? { slide: nextSlide, beatIndex: nextPos.beatIndex } : undefined,
    );
  }

  return {
    available: () => root !== null,
    isOpen,
    setOpen(open) {
      if (!root) {
        return;
      }
      show(open);
      const search = presenterSearch(location.search, open);
      if (search !== location.search) {
        history.replaceState(null, "", `${location.pathname}${search}${location.hash}`);
      }
    },
    render,
    startClock() {
      if (startedAt !== undefined) {
        return;
      }
      const started = Date.now();
      startedAt = started;
      if (elapsedEl) {
        const tick = (): void => syncElapsed(elapsedEl, started, talkBudget);
        window.setInterval(tick, 1000);
        tick();
      }
    },
    fit() {
      const preview = document.querySelector(`#${PAGE_ID.nextStage} .dekc-preview-frame`);
      const nextStage = document.getElementById(PAGE_ID.nextStage);
      if (preview instanceof HTMLElement && nextStage && isOpen()) {
        fitStage(preview, nextStage);
      }
    },
  };
}
