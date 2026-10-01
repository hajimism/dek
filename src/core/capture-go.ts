import type { Page } from "playwright";
import { finishBeat } from "./finish-beat.ts";
import {
  type EvaluatingPage,
  freezeAt,
  holdStarted,
  seekStarted,
  startGoPaused,
} from "./in-page-go.ts";
import type { MorphSpec } from "./playwright.ts";
import type { Position } from "./step.ts";

/** Loads the video document with motion on, the way `dekc video` plays it. */
export async function loadVideoDoc(
  page: Pick<Page, "emulateMedia" | "setContent">,
  html: string,
): Promise<void> {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setContent(html, { waitUntil: "load" });
}

/** Goes to `position` and ends that beat, as the page stands when the talk moves on. */
export async function settleAt(page: EvaluatingPage, position: Position): Promise<void> {
  await page.evaluate((to) => window.dekcGo?.(to), position);
  await page.evaluate(finishBeat);
}

/**
 * Plays `go(position)` held still: shoots it at each of `stopsFor(span)` ms into everything the
 * go started, then ends it as a still of that beat ends it and shoots that. The span is the
 * longest of the go's animations and the slide script's motion. Returns the span.
 */
export async function captureGo(
  page: EvaluatingPage,
  position: Position,
  stopsFor: (span: number) => number[],
  shoot: (ms: number, end: boolean) => Promise<void>,
): Promise<number> {
  await page.evaluate(startGoPaused, position);
  const span = await page.evaluate(holdStarted);
  for (const ms of stopsFor(span)) {
    await page.evaluate(seekStarted, ms);
    await shoot(ms, false);
  }
  await endGo(page);
  await shoot(span, true);
  return span;
}

/**
 * Settles `from`, then starts `go(to)` and stops every animation (view-transition pseudo-elements
 * included) at `at` of the view transition's span. The slide script is held at the morph's moment
 * in ms, not at `at` of its own motion, the way the video recorder seeks both.
 *
 * Unlike `captureGo`, the span here is the view transition's alone: `--at` names a moment of the
 * move between slides, however long the slide's own entrance runs.
 */
export async function freezeTransition(page: EvaluatingPage, morph: MorphSpec): Promise<void> {
  await settleAt(page, morph.from);
  if (!(await page.evaluate(startGoPaused, morph.to))) {
    // No transition to hold at a moment of; the frame is the go at its end, as a still shows it.
    await endGo(page);
    return;
  }
  await page.evaluate(freezeAt, morph.at);
}

/** Ends the go `startGoPaused` began, as a still of its beat ends it, and waits for it to return. */
async function endGo(page: EvaluatingPage): Promise<void> {
  await page.evaluate(finishBeat);
  await page.evaluate(() => window.__dekcPendingGo);
}
