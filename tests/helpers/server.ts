import type { PlaywrightRunner } from "../../src/core/playwright.ts";
import { type DevServer, startDevServer } from "../../src/server/dev.ts";
import type { DeckEvent, EventFeed } from "../../src/server/hub.ts";
import { WAIT_MS } from "./wait.ts";

/**
 * Tests re-scan often: an edit fs.watch misses shows within a tenth of a second instead of the
 * two seconds a user's server waits, which a loaded machine can stretch past the test timeout.
 */
const TEST_POLL_INTERVAL_MS = 100;

export async function withDevServer<T>(
  options: {
    cwd: string;
    port?: number;
    visual?: boolean;
    visualRunner?: PlaywrightRunner;
    remote?: boolean;
    password?: string;
    pairingTtlMs?: number;
    deck?: string;
    pollIntervalMs?: number;
  },
  fn: (server: DevServer) => Promise<T>,
): Promise<T> {
  const server = await startDevServer({
    port: 0,
    pollIntervalMs: TEST_POLL_INTERVAL_MS,
    ...options,
  });
  try {
    return await fn(server);
  } finally {
    await server.close();
  }
}

/** The first event `predicate` accepts; the listener goes away with the answer or the timeout. */
export function waitForEvent(
  events: EventFeed,
  predicate: (event: DeckEvent) => boolean,
  timeoutMs = WAIT_MS,
): Promise<DeckEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unlisten();
      reject(new Error("timed out waiting for dev event"));
    }, timeoutMs);
    const unlisten = events.listen((event) => {
      if (predicate(event)) {
        clearTimeout(timer);
        unlisten();
        resolve(event);
      }
    });
  });
}
