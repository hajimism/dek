import type { PlaywrightRunner } from "../../src/core/playwright.ts";
import { type DevEvent, type DevServer, startDevServer } from "../../src/server/dev.ts";
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

export async function waitForEvent(
  events: AsyncIterable<DevEvent>,
  predicate: (event: DevEvent) => boolean,
  timeoutMs = WAIT_MS,
): Promise<DevEvent> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("timed out waiting for dev event")), timeoutMs);
  });
  const matched = (async () => {
    for await (const event of events) {
      if (predicate(event)) {
        return event;
      }
    }
    throw new Error("dev event stream ended");
  })();
  return Promise.race([matched, timeout]);
}
