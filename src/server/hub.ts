import type { Diagnostic } from "../core/diagnostic.ts";

export type DevEvent =
  /** Slides by slug: the stream reaches the audience, so it names no path on disk. */
  | { type: "sync"; created: string[]; updated?: string[]; removed?: string[] }
  | { type: "reload-slide"; slug: string }
  | { type: "reload-theme" }
  | { type: "reload-script"; slugs: string[] }
  | { type: "diagnostics"; diagnostics: Diagnostic[] }
  | { type: "timeline" };

export type EventHub = AsyncIterable<DevEvent> & {
  emit(event: DevEvent): void;
  close(): void;
  /** An SSE stream of every event `accept` lets through, all of them when it is left out. */
  subscribe(accept?: (event: DevEvent) => boolean): ReadableStream<Uint8Array>;
};

/** Bun closes a request that is idle for 10s; an SSE comment keeps `/events` open. */
export const SSE_HEARTBEAT_MS = 5_000;

export function createEventHub(options: { heartbeatMs?: number } = {}): EventHub {
  const buffer: DevEvent[] = [];
  const waiters: Array<(event: IteratorResult<DevEvent>) => void> = [];
  type Accept = (event: DevEvent) => boolean;
  const clients = new Map<ReadableStreamDefaultController<Uint8Array>, Accept>();
  const encoder = new TextEncoder();
  let closed = false;

  const take = (): DevEvent | undefined => buffer.shift();

  const broadcast = (bytes: Uint8Array, event?: DevEvent): void => {
    for (const [client, accept] of clients) {
      if (event && !accept(event)) {
        continue;
      }
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
    broadcast(encoder.encode(`data: ${JSON.stringify(event)}\n\n`), event);
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
      for (const client of clients.keys()) {
        try {
          client.close();
        } catch {
          /* already closed */
        }
      }
      clients.clear();
      stopHeartbeat();
    },
    subscribe(accept = () => true) {
      let client: ReadableStreamDefaultController<Uint8Array>;
      return new ReadableStream<Uint8Array>({
        start(controller) {
          client = controller;
          clients.set(controller, accept);
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
