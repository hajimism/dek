/// <reference lib="dom" />
import { PAGE_ID, type PageMode } from "../core/page.ts";

import { advance, type DeckStops } from "../core/position.ts";
import {
  nextPresenterTitle,
  type PresenterSlide,
  presenterState,
} from "../core/presenter-state.ts";
import { type Position, stepValuesForBeat } from "../core/step.ts";
import { formatClock } from "../core/timing.ts";
import { visualClone } from "./clone.ts";
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

/** Owns the presenter's panels: the script, the beats, what comes next, the clock, the progress. */
export function createPresenterView(options: {
  slides: PresenterSlide[];
  deck: DeckStops;
  stage: Stage;
  /** The page opens with the panels shown when it is the presenter page. */
  mode: PageMode;
}): PresenterView {
  const { slides, stage } = options;
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

  if (
    root &&
    (new URLSearchParams(location.search).has("presenter") || options.mode === "presenter")
  ) {
    show(true);
  }

  function syncElapsed(): void {
    if (!elapsedEl || startedAt === undefined) {
      return;
    }
    const elapsed = (Date.now() - startedAt) / 1000;
    elapsedEl.textContent = formatClock(elapsed);
    const tone = elapsedTone(elapsed, talkBudget);
    elapsedEl.classList.toggle("is-warn", tone === "warn");
    elapsedEl.classList.toggle("is-over", tone === "over");
  }

  function renderBeats(pos: Position, beats: PresenterSlide["beats"]): void {
    const beatsEl = document.getElementById(PAGE_ID.beats);
    if (!beatsEl) {
      return;
    }
    if (beatsFor !== pos.slideIndex) {
      beatsFor = pos.slideIndex;
      beatsEl.replaceChildren(
        ...beats.map((beat, i) => {
          const li = document.createElement("li");
          li.setAttribute("data-beat-index", String(i + 1));
          li.textContent = beat.title;
          return li;
        }),
      );
    }
    for (const el of beatsEl.querySelectorAll("[data-beat-index]")) {
      el.classList.toggle(
        "is-current-beat",
        Number(el.getAttribute("data-beat-index")) === pos.beatIndex,
      );
    }
  }

  function renderProgress(pos: Position): void {
    if (!progressEl) {
      return;
    }
    progressEl.replaceChildren(
      ...options.deck.map((slide, index) => {
        const span = document.createElement("span");
        if (index < pos.slideIndex) {
          span.className = "is-done";
        } else if (index === pos.slideIndex) {
          span.className = "is-current";
          span.style.setProperty(
            "--dek-fill",
            `${progressFill(pos.beatIndex, slide.stops) * 100}%`,
          );
        }
        return span;
      }),
    );
  }

  function renderNextPreview(nextPos: Position | null): void {
    const previewStage = document.getElementById(PAGE_ID.nextStage);
    if (!previewStage) {
      return;
    }
    const nextSlide = nextPos ? slides[nextPos.slideIndex] : undefined;
    if (!isOpen() || !nextPos || !nextSlide) {
      previewStage.replaceChildren();
      return;
    }
    const source = stage.slideEl(nextSlide.slug);
    const deckEl = document.getElementById(PAGE_ID.deck);
    const clone = source ? visualClone(source) : undefined;
    if (!clone || !deckEl) {
      previewStage.replaceChildren();
      return;
    }
    applyIsShown(
      [...clone.querySelectorAll("[data-step]")],
      stepValuesForBeat(nextSlide.beats, nextPos.beatIndex),
    );
    const frame = document.createElement("div");
    frame.className = "dek-preview-frame";
    frame.style.width = `${deckEl.offsetWidth || 1280}px`;
    frame.style.height = `${deckEl.offsetHeight || 720}px`;
    frame.append(clone);
    previewStage.replaceChildren(frame);
    stage.drawStill(clone, nextSlide, nextPos.beatIndex);
    fitStage(frame, previewStage);
  }

  function render(pos: Position): void {
    const current = slides[pos.slideIndex];
    const state = current ? presenterState(slides, pos) : undefined;
    const scriptEl = document.getElementById(PAGE_ID.script);
    if (scriptEl && state) {
      scriptEl.textContent = state.script;
    }
    const nextPos = advance(pos, options.deck);
    const nextEl = document.getElementById(PAGE_ID.next);
    if (nextEl) {
      nextEl.textContent = state ? nextPresenterTitle(state) : "";
    }
    const nextEnd = document.getElementById(PAGE_ID.nextEnd);
    if (nextEnd) {
      nextEnd.hidden = Boolean(nextPos);
    }
    if (state) {
      renderBeats(pos, state.current.beats);
    }
    if (budgetEl) {
      budgetEl.textContent =
        current?.budgetSeconds !== undefined ? formatClock(current.budgetSeconds) : "";
    }
    const pageEl = document.getElementById(PAGE_ID.page);
    if (pageEl) {
      const total = document.createElement("span");
      total.className = "dek-page-total";
      total.textContent = `/ ${slides.length}`;
      pageEl.replaceChildren(document.createTextNode(`${pos.slideIndex + 1} `), total);
    }
    renderProgress(pos);
    renderNextPreview(nextPos);
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
      startedAt = Date.now();
      window.setInterval(syncElapsed, 1000);
      syncElapsed();
    },
    fit() {
      const preview = document.querySelector(`#${PAGE_ID.nextStage} .dek-preview-frame`);
      const nextStage = document.getElementById(PAGE_ID.nextStage);
      if (preview instanceof HTMLElement && nextStage && isOpen()) {
        fitStage(preview, nextStage);
      }
    },
  };
}
