/// <reference lib="dom" />
import { PAGE_ID } from "../core/page.ts";

import type { Move } from "../core/position.ts";
import { isPresenterToggleKey } from "./presenter.ts";
import { isRailToggleKey } from "./rail.ts";
import { isInteractive, isLetterKey, isTextEntry, keyToMove, pointerMove } from "./step.ts";

/** What a key or a touch on the page may ask for. Each returns whether it took the request. */
export type InputActions = {
  /** Any key the page hears. */
  onKey: () => void;
  togglePresenter: () => boolean;
  toggleFullscreen: () => void;
  toggleRail: () => boolean;
  /** Space; left to `move` unless this takes it (a rehearsal plays and pauses). */
  togglePlay: () => boolean;
  move: (move: Move) => void;
};

/** Listen for the keys on the page and for taps and swipes on the slide stage. */
export function bindInput(actions: InputActions): void {
  document.addEventListener("keydown", (event) => {
    // Keys typed into a field on a slide are the field's.
    if (isTextEntry(event.target)) {
      return;
    }
    actions.onKey();
    if (isPresenterToggleKey(event)) {
      if (actions.togglePresenter()) {
        event.preventDefault();
      }
      return;
    }
    if (isLetterKey(event, "f")) {
      event.preventDefault();
      actions.toggleFullscreen();
      return;
    }
    if (isRailToggleKey(event)) {
      if (actions.toggleRail()) {
        event.preventDefault();
      }
      return;
    }
    if (event.key === " " && actions.togglePlay()) {
      event.preventDefault();
      return;
    }
    const move = keyToMove(event);
    if (!move) {
      return;
    }
    event.preventDefault();
    actions.move(move);
  });
  const stageEl = document.getElementById(PAGE_ID.currentStage);
  if (stageEl) {
    bindStagePointer(stageEl, actions.move);
  }
}

function bindStagePointer(stageEl: HTMLElement, onMove: (move: Move) => void): void {
  let start: { x: number; y: number; id: number } | undefined;
  stageEl.addEventListener("pointerdown", (event) => {
    // A right click, or one held with a modifier (Shift extends a selection), is the browser's.
    const modified = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
    const theirs = event.pointerType === "mouse" && (event.button !== 0 || modified);
    if (theirs || isInteractive(event.target)) {
      start = undefined;
      return;
    }
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  stageEl.addEventListener("pointerup", (event) => {
    if (!start || start.id !== event.pointerId) {
      return;
    }
    // A click that ends a text selection, such as a double click on a word, keeps the slide.
    if (event.pointerType === "mouse" && getSelection()?.isCollapsed === false) {
      start = undefined;
      return;
    }
    const rect = stageEl.getBoundingClientRect();
    const move = pointerMove(
      {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        dx: event.clientX - start.x,
        dy: event.clientY - start.y,
      },
      rect,
      event.pointerType,
    );
    start = undefined;
    if (move) {
      onMove(move);
    }
  });
  stageEl.addEventListener("pointercancel", () => {
    start = undefined;
  });
}
