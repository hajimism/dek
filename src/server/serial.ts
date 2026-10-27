/**
 * Runs `run` one at a time: a call while it runs queues one more run after it, however many
 * calls come. Each caller's `run` reports its own failures, as diagnostics or a line on stderr;
 * one that still throws is a bug, logged to the dev server's stderr as Bun.serve's error handler
 * logs one, and the queued run still runs.
 */
export function createSerialTask(run: () => Promise<void>): () => void {
  let running = false;
  let queued = false;
  return () => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    void (async () => {
      try {
        do {
          queued = false;
          try {
            await run();
          } catch (error) {
            console.error(error);
          }
        } while (queued);
      } finally {
        running = false;
      }
    })();
  };
}
