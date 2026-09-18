import type { PlaywrightRunner } from "../../src/core/playwright.ts";
import { type DevEvent, type DevServer, startDevServer } from "../../src/server/dev.ts";

export async function withDevServer<T>(
  options: {
    cwd: string;
    port?: number;
    visualRunner?: PlaywrightRunner;
    remote?: boolean;
    password?: string;
  },
  fn: (server: DevServer) => Promise<T>,
): Promise<T> {
  const server = await startDevServer({ port: 0, ...options });
  try {
    return await fn(server);
  } finally {
    await server.close();
  }
}

export async function waitForEvent(
  events: AsyncIterable<DevEvent>,
  predicate: (event: DevEvent) => boolean,
  timeoutMs = 3000,
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
