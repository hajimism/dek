import type { Position } from "../core/step.ts";
import { parsePosition, positionsEqual } from "./position.ts";

export const RECONNECT_BASE_MS = 500;
export const RECONNECT_MAX_MS = 10_000;

/**
 * How long to wait before reconnect `attempt` (from 0): doubling from half a second up to a cap,
 * then cut by a random share of up to half, so the phones a Wi-Fi drop cut off together do not
 * all come back in the same instant.
 */
export function reconnectDelay(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt);
  return ceiling / 2 + (random() * ceiling) / 2;
}

/** The part of a WebSocket the deck uses. */
export type SocketLike = {
  readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(
    type: "open" | "message" | "close",
    listener: (event: { data?: unknown }) => void,
  ): void;
};

const OPEN = 1;

export type PositionSocket = {
  /** Tell the server where the deck is headed; kept for the next connection while offline. */
  publish(position: Position): void;
  /** Close for good: no reconnect follows. */
  close(): void;
};

/**
 * The deck's line to the server, which relays positions between the presenter, the audience,
 * and a phone remote. Like an EventSource, it reconnects by itself after a drop (a restarted
 * server, a Wi-Fi blip), backing off with `reconnectDelay`, until `close`.
 *
 * On reconnect the server greets with the last position it holds, and the deck follows it, having
 * missed whatever moved meanwhile. A move this deck made while away is sent instead, and that
 * greeting, if it is still where the deck was when the line dropped, is stale and passed over.
 */
export function createPositionSocket(options: {
  connect: () => SocketLike;
  onPosition: (position: Position) => void;
  setTimer: (fn: () => void, ms: number) => number;
  clearTimer: (id: number) => void;
  random?: () => number;
}): PositionSocket {
  let socket: SocketLike | undefined;
  let timer: number | undefined;
  let attempt = 0;
  let closed = false;
  /** Where the server and this deck last agreed the deck was. */
  let synced: Position | undefined;
  /** The latest move made while the line was down. */
  let unsent: Position | undefined;
  /** A greeting to pass over: the server's position from before `unsent`. */
  let stale: Position | undefined;

  const connect = (): void => {
    timer = undefined;
    const current = options.connect();
    socket = current;
    current.addEventListener("open", () => {
      attempt = 0;
      if (unsent) {
        current.send(JSON.stringify(unsent));
        stale = synced;
        synced = unsent;
        unsent = undefined;
      }
    });
    current.addEventListener("message", (event) => {
      const position = parsePosition(String(event.data));
      if (!position) {
        return;
      }
      const skip = stale !== undefined && positionsEqual(stale, position);
      stale = undefined;
      if (skip) {
        return;
      }
      synced = position;
      options.onPosition(position);
    });
    current.addEventListener("close", () => {
      if (closed || socket !== current) {
        return;
      }
      socket = undefined;
      timer = options.setTimer(connect, reconnectDelay(attempt++, options.random));
    });
  };
  connect();

  return {
    publish(position) {
      if (socket?.readyState === OPEN) {
        socket.send(JSON.stringify(position));
        synced = position;
      } else {
        unsent = position;
      }
    },
    close() {
      closed = true;
      if (timer !== undefined) {
        options.clearTimer(timer);
        timer = undefined;
      }
      socket?.close();
      socket = undefined;
    },
  };
}
