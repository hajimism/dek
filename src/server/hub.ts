import type { Diagnostic } from "../core/diagnostic.ts";

export type DevEvent =
  | { type: "sync"; created: string[]; removed?: string[] }
  | { type: "reload-slide"; slug: string }
  | { type: "reload-theme" }
  | { type: "reload-script"; slugs: string[] }
  | { type: "diagnostics"; diagnostics: Diagnostic[] }
  | { type: "timeline" };

export type EventHub = AsyncIterable<DevEvent> & {
  emit(event: DevEvent): void;
  close(): void;
  subscribe(): ReadableStream<Uint8Array>;
};

/** Bun closes a request that is idle for 10s; an SSE comment keeps `/events` open. */
export const SSE_HEARTBEAT_MS = 5_000;

export function createEventHub(options: { heartbeatMs?: number } = {}): EventHub {
  const buffer: DevEvent[] = [];
  const waiters: Array<(event: IteratorResult<DevEvent>) => void> = [];
  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const encoder = new TextEncoder();
  let closed = false;

  const take = (): DevEvent | undefined => buffer.shift();

  const broadcast = (bytes: Uint8Array): void => {
    for (const client of clients) {
      try {
        client.enqueue(bytes);
      } catch {
        clients.delete(client);
      }
    }
    if (clients.size === 0) {
      stopHeartbeat();
    }
  };

  const pushSse = (event: DevEvent): void => {
    broadcast(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  };

  const ping = encoder.encode(": ping\n\n");
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const startHeartbeat = (): void => {
    heartbeat ??= setInterval(() => broadcast(ping), options.heartbeatMs ?? SSE_HEARTBEAT_MS);
  };
  function stopHeartbeat(): void {
    clearInterval(heartbeat);
    heartbeat = undefined;
  }

  return {
    emit(event) {
      if (closed) {
        return;
      }
      pushSse(event);
      const waiter = waiters.shift();
      if (waiter) {
        waiter({ value: event, done: false });
        return;
      }
      buffer.push(event);
    },
    close() {
      closed = true;
      while (waiters.length > 0) {
        waiters.shift()?.({ value: undefined, done: true });
      }
      for (const client of clients) {
        try {
          client.close();
        } catch {
          /* already closed */
        }
      }
      clients.clear();
      stopHeartbeat();
    },
    subscribe() {
      let client: ReadableStreamDefaultController<Uint8Array>;
      return new ReadableStream<Uint8Array>({
        start(controller) {
          client = controller;
          clients.add(controller);
          controller.enqueue(encoder.encode(": connected\n\n"));
          startHeartbeat();
        },
        cancel() {
          clients.delete(client);
          if (clients.size === 0) {
            stopHeartbeat();
          }
        },
      });
    },
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<DevEvent>> {
          if (buffer.length > 0) {
            const value = take();
            if (value) {
              return Promise.resolve({ value, done: false });
            }
          }
          if (closed) {
            return Promise.resolve({ value: undefined, done: true });
          }
          return new Promise((resolve) => {
            waiters.push(resolve);
          });
        },
      };
    },
  };
}
