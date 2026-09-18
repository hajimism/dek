export type AnimationLike = {
  playState?: string;
  finished?: Promise<unknown>;
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
    if (animation.finished) {
      tasks.push(animation.finished.catch(() => undefined));
    }
  }
  if (tasks.length > 0) {
    await Promise.all(tasks);
  }
}
