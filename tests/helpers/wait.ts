/**
 * How long a test waits for something it expects: an event, a page, a socket. The wait only
 * bounds a failure, so it is generous; a passing test returns as soon as the thing arrives, and
 * a loaded machine (a parallel run, CI) can stretch a tenth of a second into seconds.
 *
 * A wait for something that must NOT happen is a different thing and stays short and explicit.
 */
export const WAIT_MS = 10_000;

/** Resolves once `condition` holds, checking again after each turn of the event loop. */
export async function waitFor(condition: () => boolean, timeoutMs = WAIT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
