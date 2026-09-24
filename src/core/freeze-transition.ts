import type { MorphRequest } from "./playwright.ts";
import type { Position } from "./step.ts";

type EvaluatingPage = {
  evaluate<T, A>(fn: (arg: A) => T | Promise<T>, arg?: A): Promise<T>;
};

/**
 * Run the player's own `go` for `from`, then start `go(to)` and stop every
 * animation (view-transition pseudo-elements included) at `at` of its
 * duration. The slide script is held at the morph's moment in ms, not at
 * `at` of its own motion, the way the video recorder seeks both.
 */
export async function freezeTransition(page: EvaluatingPage, morph: MorphRequest): Promise<void> {
  await page.evaluate((position) => window.dekGo?.(position), morph.from);
  if (!(await page.evaluate(startGoPaused, morph.to))) {
    await page.evaluate(() => window.__dekPendingGo);
    return;
  }
  await page.evaluate((at) => {
    let morphMs = 0;
    for (const animation of document.getAnimations()) {
      animation.pause();
      const timing = animation.effect?.getComputedTiming();
      const duration = typeof timing?.duration === "number" ? timing.duration : 0;
      const total = (timing?.delay ?? 0) + duration;
      animation.currentTime = at * total;
      morphMs = Math.max(morphMs, at * total);
    }
    // The script started with the same go, so it is as many ms in as the morph.
    window.dekMotion?.seek(morphMs);
  }, morph.at);
}

/**
 * Runs in the page, shipped by `page.evaluate`, so it references nothing
 * outside itself. Starts the player's `go(position)`, keeps it unawaited on
 * `window.__dekPendingGo`, and resolves once the view transition it opened
 * is ready to seek (true), or after one frame when it opened none (false).
 * `startViewTransition` is wrapped only to get hold of the transition and is
 * put back before this returns; the runtime is not modified.
 */
export async function startGoPaused(position: Position): Promise<boolean> {
  const go = window.dekGo;
  if (!go) {
    return false;
  }
  // Older engines have no view transitions, whatever lib.dom says.
  const unwrapped = document.startViewTransition as typeof document.startViewTransition | undefined;
  const original = unwrapped?.bind(document);
  let captured: ViewTransition | undefined;
  let pending: Promise<void>;
  try {
    if (original) {
      const wrapped: typeof document.startViewTransition = (update) => {
        captured = original(update);
        return captured;
      };
      document.startViewTransition = wrapped;
    }
    pending = go(position);
  } finally {
    if (unwrapped) {
      document.startViewTransition = unwrapped;
    }
  }
  window.__dekPendingGo = pending;
  void pending.catch(() => undefined);
  if (!captured) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return false;
  }
  await captured.ready;
  return true;
}
