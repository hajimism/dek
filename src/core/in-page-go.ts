import type { Position } from "./step.ts";

/** The part of a Playwright page these in-page functions are shipped through. */
export type EvaluatingPage = {
  evaluate<T, A>(fn: (arg: A) => T | Promise<T>, arg?: A): Promise<T>;
};

/**
 * Runs in the page, shipped by `page.evaluate`, so it references nothing outside itself.
 * Every animation `go` started runs on one clock, so all of them stop at the same moment:
 * `at` of the view transition's span, the longest end among its pseudo-elements (or among
 * every animation, when the transition animates nothing). A short fade is then over at
 * `at` of a long morph, as it is when the talk plays.
 */
export function freezeAt(at: number): void {
  const animations = window.__dekcStarted ?? document.getAnimations();
  const endOf = (animation: Animation): number => {
    const end = animation.effect?.getComputedTiming().endTime;
    return typeof end === "number" && Number.isFinite(end) ? end : 0;
  };
  const isTransition = (animation: Animation): boolean => {
    const effect = animation.effect as { pseudoElement?: string | null } | null;
    return (effect?.pseudoElement ?? "").startsWith("::view-transition");
  };
  const transition = animations.filter(isTransition);
  const span = Math.max(0, ...(transition.length > 0 ? transition : animations).map(endOf));
  const moment = at * span;
  for (const animation of animations) {
    animation.pause();
    animation.currentTime = moment;
  }
  // The script started with the same go, so it is as many ms in as the morph.
  window.dekcMotion?.seek(moment);
}

/**
 * Runs in the page, shipped by `page.evaluate`, so it references nothing outside itself.
 * Pauses the animations the last `startGoPaused` began, and returns how long they run: the
 * longest finite end among them, or the slide script's motion when that is longer. An animation
 * that repeats forever has no end and adds nothing. With no go recorded, every animation on the
 * page counts, as on a page that has just loaded.
 */
export function holdStarted(): number {
  const started = window.__dekcStarted ?? document.getAnimations();
  let span = window.dekcMotion?.duration() ?? 0;
  for (const animation of started) {
    animation.pause();
    const end = animation.effect?.getComputedTiming().endTime;
    if (typeof end === "number" && Number.isFinite(end)) {
      span = Math.max(span, end);
    }
  }
  return span;
}

/**
 * Runs in the page, shipped by `page.evaluate`, so it references nothing outside itself.
 * Seeks the animations the last go began, and the slide script, to `ms` into that go. Nothing
 * older moves: a finished animation still answers `getAnimations()`, and seeking it would play
 * an earlier beat again.
 */
export function seekStarted(ms: number): void {
  for (const animation of window.__dekcStarted ?? document.getAnimations()) {
    animation.currentTime = ms;
  }
  window.dekcMotion?.seek(ms);
}

/**
 * Runs in the page, shipped by `page.evaluate`, so it references nothing
 * outside itself. Starts the player's `go(position)`, keeps it unawaited on
 * `window.__dekcPendingGo`, and resolves once the view transition it opened
 * is ready to seek (true), or after one frame when it opened none or the
 * browser skipped it (false),
 * and every animation the go began has started.
 * `startViewTransition` is wrapped only to get hold of the transition and is
 * put back before this returns; the runtime is not modified.
 */
export async function startGoPaused(position: Position): Promise<boolean> {
  const go = window.dekcGo;
  if (!go) {
    return false;
  }
  // Older engines have no view transitions, whatever lib.dom says.
  const unwrapped = document.startViewTransition as typeof document.startViewTransition | undefined;
  const original = unwrapped?.bind(document);
  let captured: ViewTransition | undefined;
  let pending: Promise<void>;
  // Whatever the last finished beat left belongs to it; on a page that has just loaded, nothing
  // does, so the first slide's entrance counts as this go's.
  const settled = window.__dekcSettled;
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
  window.__dekcPendingGo = pending;
  void pending.catch(() => undefined);
  // A transition the browser skips, as it does for a duplicate name, still runs its update;
  // the talk carries on without the animation, and so does this, as a go that opened none.
  const transitioned = captured
    ? await captured.ready.then(
        () => true,
        () => false,
      )
    : false;
  if (captured && !transitioned) {
    await captured.updateCallbackDone.catch(() => undefined);
  }
  if (!transitioned) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  const started = document.getAnimations().filter((animation) => !settled?.has(animation));
  window.__dekcStarted = started;
  // A pending animation may already run a frame ahead on the compositor while its main-thread
  // time still reads 0, where a seek to 0 changes nothing. Once started, the two agree.
  await Promise.allSettled(started.map((animation) => animation.ready));
  return transitioned;
}
