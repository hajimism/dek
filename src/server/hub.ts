import type { LiveEvent } from "../core/live-protocol.ts";

/** A live event and the deck it happened in; a page hears only its own deck's. */
export type DeckEvent = LiveEvent & { deck: string };

type Listener = (event: DeckEvent) => void;

/** What the server's own readers see of the hub: subscribe, and later unsubscribe. */
export type EventFeed = { listen(fn: Listener): () => void };

export type EventHub = EventFeed & {
  emit(event: DeckEvent): void;
  /** An SSE stream of every event `accept` lets through, all of them when it is left out. */
  sse(accept?: (event: DeckEvent) => boolean): ReadableStream<Uint8Array>;
  /** Drop every listener and end every stream; later events go nowhere. */
  close(): void;
};

/** Bun closes a request that is idle for 10s; an SSE comment keeps `/events` open. */
export const SSE_HEARTBEAT_MS = 5_000;

/**
 * Fan-out: each event goes to whoever listens at the time, and to no one else. Nothing is kept
 * for a listener that comes later, so a reader that stops reading cannot make the hub grow.
 */
export function createEventHub(options: { heartbeatMs?: number } = {}): EventHub {
  const listeners = new Set<Listener>();
  const streams = new Set<() => void>();
  const encoder = new TextEncoder();
  let closed = false;

  const listen = (fn: Listener): (() => void) => {
    if (closed) {
      return () => undefined;
    }
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  };

  return {
    listen,
    emit(event) {
      for (const fn of [...listeners]) {
        try {
          fn(event);
        } catch {
          // One reader's failure is its own; the rest still hear the event.
        }
      }
    },
    sse(accept = () => true) {
      let end = (): void => undefined;
      return new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (bytes: Uint8Array): void => {
            try {
              controller.enqueue(bytes);
            } catch {
              end();
            }
          };
          const heartbeat = setInterval(
            () => send(encoder.encode(": ping\n\n")),
            options.heartbeatMs ?? SSE_HEARTBEAT_MS,
          );
          // The page's stream is its deck's already, so the deck stays off the wire.
          const unlisten = listen((event) => {
            if (accept(event)) {
              const { deck: _deck, ...wire } = event;
              send(encoder.encode(`data: ${JSON.stringify(wire)}\n\n`));
            }
          });
          end = () => {
            clearInterval(heartbeat);
            unlisten();
            streams.delete(end);
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          };
          streams.add(end);
          send(encoder.encode(": connected\n\n"));
          if (closed) {
            end();
          }
        },
        cancel() {
          end();
        },
      });
    },
    close() {
      closed = true;
      listeners.clear();
      for (const end of [...streams]) {
        end();
      }
    },
  };
}
