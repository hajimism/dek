import { describe, expect, test } from "bun:test";
import type { Position } from "../../src/core/step.ts";
import {
  createPositionSocket,
  RECONNECT_MAX_MS,
  reconnectDelay,
  type SocketLike,
} from "../../src/runtime/socket.ts";

class FakeSocket implements SocketLike {
  static readonly OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  closedByClient = false;
  private listeners = new Map<string, Array<(event: { data?: unknown }) => void>>();

  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closedByClient = true;
    this.drop();
  }

  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.emit("open");
  }

  receive(position: Position): void {
    this.emit("message", { data: JSON.stringify(position) });
  }

  drop(): void {
    this.readyState = 3;
    this.emit("close");
  }

  private emit(type: string, event: { data?: unknown } = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function harness() {
  const sockets: FakeSocket[] = [];
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let nextTimer = 1;
  const received: Position[] = [];
  const remote = createPositionSocket({
    connect: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    onPosition: (position) => received.push(position),
    setTimer: (fn, ms) => {
      const id = nextTimer++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    random: () => 1,
  });
  const fire = (): number | undefined => {
    const [id, timer] = [...timers.entries()][0] ?? [];
    if (id === undefined || !timer) {
      return undefined;
    }
    timers.delete(id);
    timer.fn();
    return timer.ms;
  };
  const last = (): FakeSocket => {
    const socket = sockets.at(-1);
    if (!socket) {
      throw new Error("no socket");
    }
    return socket;
  };
  return { sockets, timers, received, remote, fire, last };
}

const at = (slideIndex: number, beatIndex = 0): Position => ({ slideIndex, beatIndex });

describe("reconnectDelay", () => {
  test("doubles from half a second to a cap, jittered down by up to half", () => {
    expect(reconnectDelay(0, () => 1)).toBe(500);
    expect(reconnectDelay(1, () => 1)).toBe(1000);
    expect(reconnectDelay(3, () => 1)).toBe(4000);
    expect(reconnectDelay(20, () => 1)).toBe(RECONNECT_MAX_MS);
    expect(reconnectDelay(1, () => 0)).toBe(500);
  });
});

describe("createPositionSocket", () => {
  test("passes on what the server sends and sends what the deck publishes", () => {
    const { received, remote, last } = harness();
    last().open();
    last().receive(at(2));
    remote.publish(at(3));
    expect(received).toEqual([at(2)]);
    expect(last().sent).toEqual([JSON.stringify(at(3))]);
  });

  test("reconnects after a drop, backing off until one opens", () => {
    const { sockets, remote, fire, last } = harness();
    last().open();
    last().drop();
    expect(fire()).toBe(500);
    last().drop();
    expect(fire()).toBe(1000);
    last().open();
    last().drop();
    // An open resets the backoff.
    expect(fire()).toBe(500);
    expect(sockets).toHaveLength(4);
    remote.publish(at(1));
  });

  test("takes the server's position on reconnect when the deck did not move meanwhile", () => {
    const { received, fire, last } = harness();
    last().open();
    last().receive(at(1));
    last().drop();
    fire();
    last().open();
    last().receive(at(4));
    expect(received).toEqual([at(1), at(4)]);
    expect(last().sent).toEqual([]);
  });

  test("sends a move made while away, and does not go back for the stale welcome", () => {
    const { received, remote, fire, last } = harness();
    last().open();
    last().receive(at(1));
    last().drop();
    remote.publish(at(2));
    remote.publish(at(3));
    fire();
    last().open();
    // The server greets with where it was before the move it has not heard yet.
    last().receive(at(1));
    last().receive(at(5));
    expect(last().sent).toEqual([JSON.stringify(at(3))]);
    expect(received).toEqual([at(1), at(5)]);
  });

  test("stays closed after close, even when the socket reports it later", () => {
    const { sockets, timers, remote, last } = harness();
    last().open();
    remote.close();
    expect(last().closedByClient).toBe(true);
    last().drop();
    expect(timers.size).toBe(0);
    expect(sockets).toHaveLength(1);
  });

  test("cancels a pending reconnect on close", () => {
    const { timers, remote, last } = harness();
    last().drop();
    expect(timers.size).toBe(1);
    remote.close();
    expect(timers.size).toBe(0);
  });

  test("ignores a message that is not a position", () => {
    const { received, last } = harness();
    last().open();
    (last() as unknown as { emit(type: string, event: { data: unknown }): void }).emit("message", {
      data: "nope",
    });
    expect(received).toEqual([]);
  });
});
