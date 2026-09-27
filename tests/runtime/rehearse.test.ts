import { describe, expect, test } from "bun:test";
import { positionsEqual } from "../../src/core/position.ts";
import type { Position } from "../../src/core/step.ts";
import { createGuardedGo } from "../../src/runtime/go.ts";
import type { GoOrigin } from "../../src/runtime/navigator.ts";
import {
  createRehearseController,
  createRehearseDriver,
  type Rehearsal,
  type RehearseAudio,
} from "../../src/runtime/rehearse.ts";

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

  test("seek moves the clock to a beat and leaves the deck to the caller", () => {
    const calls: Position[] = [];
    const sought: number[] = [];
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
      onSeek: (ms) => sought.push(ms),
    });
    driver.seek({ slideIndex: 1, beatIndex: 0 });
    expect(driver.elapsed()).toBe(800);
    expect(sought).toEqual([800]);
    // Playing on from the beat just sought does not send the deck there again.
    driver.play();
    expect(calls).toEqual([]);
  });

  test("seek to a stop the timeline lacks keeps the clock at the stop before it", () => {
    const driver = createRehearseDriver({
      schedule: [
        { at: 0, position: { slideIndex: 0, beatIndex: 0 } },
        { at: 500, position: { slideIndex: 1, beatIndex: 1 } },
        { at: 900, position: { slideIndex: 2, beatIndex: 0 } },
      ],
      go: () => undefined,
      now: () => 0,
      setTimer: () => 1,
      clearTimer: () => undefined,
    });
    driver.seek({ slideIndex: 1, beatIndex: 3 });
    expect(driver.elapsed()).toBe(500);
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

/** A voice track that only records whether it plays. */
function fakeAudio(): RehearseAudio & { playing: boolean } {
  return {
    currentTime: 0,
    playing: false,
    play() {
      this.playing = true;
    },
    pause() {
      this.playing = false;
    },
  };
}

const at = (slideIndex: number, beatIndex = 0): Position => ({ slideIndex, beatIndex });

describe("createRehearseController", () => {
  function controller(loads: Array<() => Promise<Rehearsal | undefined>>) {
    const moves: Array<[Position, GoOrigin]> = [];
    let next = 0;
    const rehearse = createRehearseController({
      load: () => {
        const load = loads[next] ?? loads[loads.length - 1];
        next += 1;
        return load ? load() : Promise.resolve(undefined);
      },
      go: (position, origin) => {
        moves.push([position, origin]);
      },
      current: () => at(1),
    });
    return { rehearse, moves };
  }
  const schedule = [
    { at: 0, position: at(0) },
    { at: 600_000, position: at(1) },
    { at: 1_200_000, position: at(2) },
  ];

  test("plays on from where the deck is without moving it", async () => {
    const audio = fakeAudio();
    const { rehearse, moves } = controller([async () => ({ schedule, audio })]);
    await rehearse.load();
    expect(rehearse.ready()).toBe(true);
    expect(audio.playing).toBe(true);
    expect(audio.currentTime).toBe(600);
    expect(moves).toEqual([]);
  });

  test("sends a key's move out and keeps a peer's in", async () => {
    const { rehearse, moves } = controller([async () => ({ schedule })]);
    await rehearse.load();
    rehearse.move(at(2), "local");
    rehearse.move(at(0), "remote");
    expect(moves).toEqual([
      [at(2), "local"],
      [at(0), "remote"],
    ]);
  });

  test("a reload silences the old track, and a stale load never plays", async () => {
    const first = fakeAudio();
    const stale = fakeAudio();
    const fresh = fakeAudio();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { rehearse } = controller([
      async () => ({ schedule, audio: first }),
      async () => {
        await gate;
        return { schedule, audio: stale };
      },
      async () => ({ schedule, audio: fresh }),
    ]);
    await rehearse.load();
    expect(first.playing).toBe(true);
    const slow = rehearse.load();
    expect(first.playing).toBe(false);
    await rehearse.load();
    release();
    await slow;
    expect([first.playing, stale.playing, fresh.playing]).toEqual([false, false, true]);
  });

  test("turns off when the timeline is gone", async () => {
    const { rehearse, moves } = controller([async () => ({ schedule }), async () => undefined]);
    await rehearse.load();
    await rehearse.load();
    expect(rehearse.ready()).toBe(false);
    rehearse.move(at(2), "local");
    expect(moves).toEqual([]);
  });
});
