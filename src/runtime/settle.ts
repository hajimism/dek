export type AnimationLike = {
  playState?: string;
  finished?: Promise<unknown>;
  effect?: { getComputedTiming(): { endTime?: number | CSSNumberish } } | null;
};

export type ViewTransitionLike = {
  finished: Promise<unknown>;
};

export async function waitForPlaybackSettle(options: {
  animations?: AnimationLike[];
  viewTransition?: ViewTransitionLike | null;
}): Promise<void> {
  const tasks: Array<Promise<unknown>> = [];
  if (options.viewTransition) {
    tasks.push(options.viewTransition.finished.catch(() => undefined));
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
