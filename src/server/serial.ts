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
          } catch {
            /* keep draining the trailing run */
          }
        } while (queued);
      } finally {
        running = false;
      }
    })();
  };
}
