import type { Diagnostic } from "../core/diagnostic.ts";

export type DevEvent =
  | { type: "sync"; created: string[]; removed?: string[] }
  | { type: "reload-slide"; slug: string }
  | { type: "reload-theme" }
  | { type: "diagnostics"; diagnostics: Diagnostic[] }
  | { type: "timeline" };

export type EventHub = AsyncIterable<DevEvent> & {
  emit(event: DevEvent): void;
  close(): void;
  subscribe(): ReadableStream<Uint8Array>;
};

export function createEventHub(): EventHub {
  const buffer: DevEvent[] = [];
  const waiters: Array<(event: IteratorResult<DevEvent>) => void> = [];
  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const encoder = new TextEncoder();
  let closed = false;

  const take = (): DevEvent | undefined => buffer.shift();

  const pushSse = (event: DevEvent): void => {
    const bytes = encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
    for (const client of clients) {
      try {
        client.enqueue(bytes);
      } catch {
        clients.delete(client);
      }
    }
  };

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
    },
    subscribe() {
      let client: ReadableStreamDefaultController<Uint8Array>;
      return new ReadableStream<Uint8Array>({
        start(controller) {
          client = controller;
          clients.add(controller);
          controller.enqueue(encoder.encode(": connected\n\n"));
        },
        cancel() {
          clients.delete(client);
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
