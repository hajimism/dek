import { describe, expect, test } from "bun:test";
import type { Position } from "../../src/core/step.ts";
import { createGuardedGo } from "../../src/runtime/go.ts";
import { positionsEqual } from "../../src/runtime/position.ts";
import { createRehearseDriver } from "../../src/runtime/rehearse.ts";

describe("createGuardedGo", () => {
  test("queues the latest go while the first is in flight", async () => {
    const seen: number[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const go = createGuardedGo(async (next: number) => {
      seen.push(next);
      await gate;
    });
    const first = go(1);
    const second = go(2);
    release();
    await Promise.all([first, second]);
    expect(seen).toEqual([1, 2]);
  });
});

describe("createRehearseDriver", () => {
  test("plays due beats and arms later ones", () => {
    const calls: Position[] = [];
    const timers = new Map<number, { at: number; fn: () => void }>();
    let now = 0;
    let nextId = 1;
    const driver = createRehearseDriver({
      schedule: [
        { at: 0, position: { slideIndex: 0, beatIndex: 0 } },
        { at: 1000, position: { slideIndex: 0, beatIndex: 1 } },
      ],
      go: (position) => {
        calls.push(position);
      },
      now: () => now,
      setTimer: (fn, ms) => {
        const id = nextId;
        nextId += 1;
        timers.set(id, { at: now + ms, fn });
        return id;
      },
      clearTimer: (id) => {
        timers.delete(id as number);
      },
    });

    driver.play();
    expect(calls).toEqual([{ slideIndex: 0, beatIndex: 0 }]);
    expect(driver.playing()).toBe(true);

    now = 1000;
    for (const timer of [...timers.values()]) {
      if (timer.at <= now) {
        timer.fn();
      }
    }
    expect(calls).toEqual([
      { slideIndex: 0, beatIndex: 0 },
      { slideIndex: 0, beatIndex: 1 },
    ]);

    driver.pause();
    expect(driver.playing()).toBe(false);
  });

  test("seek jumps to a beat and follows with audio time", () => {
    const calls: Position[] = [];
    const driver = createRehearseDriver({
      schedule: [
        { at: 0, position: { slideIndex: 0, beatIndex: 0 } },
        { at: 800, position: { slideIndex: 1, beatIndex: 0 } },
      ],
      go: (position) => {
        calls.push(position);
      },
      now: () => 0,
      setTimer: () => 1,
      clearTimer: () => undefined,
    });
    driver.seek({ slideIndex: 1, beatIndex: 0 });
    expect(calls).toEqual([{ slideIndex: 1, beatIndex: 0 }]);
    expect(driver.elapsed()).toBe(800);
  });

  test("ignores BroadcastChannel echoes of the current position", async () => {
    const calls: Position[] = [];
    let pos: Position = { slideIndex: 0, beatIndex: 0 };
    const listeners: Array<(next: Position) => void> = [];
    const channel = {
      postMessage(next: Position) {
        for (const listener of listeners) {
          listener(next);
        }
      },
    };
    const go = createGuardedGo(async (next: Position) => {
      calls.push(next);
      pos = next;
      channel.postMessage(next);
    });
    const driver = createRehearseDriver({
      schedule: [{ at: 0, position: { slideIndex: 0, beatIndex: 0 } }],
      go,
    });
    listeners.push((next) => {
      if (positionsEqual(pos, next)) {
        return;
      }
      driver.seek(next);
    });
    await go({ slideIndex: 0, beatIndex: 0 });
    expect(calls).toEqual([{ slideIndex: 0, beatIndex: 0 }]);
  });
});
