export type AnimationLike = {
  playState?: string;
  finished?: Promise<unknown>;
  effect?: { getComputedTiming(): { endTime?: number | CSSNumberish } } | null;
};

export type ViewTransitionLike = {
  finished: Promise<unknown>;
  /** Rejects when the transition is skipped, which a hurried move does on purpose. */
  ready?: Promise<unknown>;
  /** Rejects when the update itself threw. */
  updateCallbackDone?: Promise<unknown>;
};

export async function waitForPlaybackSettle(options: {
  animations?: AnimationLike[];
  viewTransition?: ViewTransitionLike | null;
}): Promise<void> {
  const tasks: Array<Promise<unknown>> = [];
  const transition = options.viewTransition;
  if (transition) {
    // A skipped transition still ran its update; only the animation was dropped.
    transition.ready?.catch(() => undefined);
    tasks.push(transition.finished.catch(() => undefined));
    // The update's own error is the move's, as it is when no transition wraps it.
    if (transition.updateCallbackDone) {
      tasks.push(transition.updateCallbackDone);
    }
  }
  for (const animation of options.animations ?? []) {
    if (animation.playState === "idle" || animation.playState === "finished") {
      continue;
    }
    // One that repeats forever never finishes; waiting on it would stall every later go.
    if (animation.effect?.getComputedTiming().endTime === Number.POSITIVE_INFINITY) {
      continue;
    }
    if (animation.finished) {
      tasks.push(animation.finished.catch(() => undefined));
    }
  }
  if (tasks.length > 0) {
    await Promise.all(tasks);
  }
}
