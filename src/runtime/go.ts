/**
 * Run one move at a time. A move asked for while another runs waits, and only the latest waiting
 * move runs next. `onQueue` fires as one starts waiting, so the move in flight can cut its
 * animation short instead of making the presenter wait it out.
 */
export function createGuardedGo<T>(
  run: (next: T) => Promise<void>,
  options: { onQueue?: () => void } = {},
): (next: T | null | undefined) => Promise<void> {
  let busy = false;
  let queued: T | undefined;
  return async (next) => {
    if (next == null) {
      return;
    }
    if (busy) {
      queued = next;
      options.onQueue?.();
      return;
    }
    busy = true;
    let firstError: unknown;
    try {
      let current: T | undefined = next;
      while (current !== undefined) {
        queued = undefined;
        try {
          await run(current);
        } catch (error) {
          firstError ??= error;
        }
        current = queued;
      }
    } finally {
      busy = false;
    }
    if (firstError !== undefined) {
      throw firstError;
    }
  };
}

/** Follow a peer's move to `next` through `go`, unless the deck already heads there. */
export function applyIncomingPosition<T>(
  go: (next: T) => unknown,
  next: T,
  options: {
    equal: (a: T, b: T) => boolean;
    current: () => T;
  },
): void {
  if (options.equal(options.current(), next)) {
    return;
  }
  void go(next);
}
