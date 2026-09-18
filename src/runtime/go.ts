export function createGuardedGo<T>(
  run: (next: T) => Promise<void>,
): (next: T | null | undefined) => Promise<void> {
  let busy = false;
  let queued: T | undefined;
  return async (next) => {
    if (next == null) {
      return;
    }
    if (busy) {
      queued = next;
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
