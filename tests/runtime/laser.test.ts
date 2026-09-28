import { describe, expect, test } from "bun:test";
import type { Pointer } from "../../src/core/live-protocol.ts";
import {
  createLaserDot,
  createLaserFeed,
  LASER_HEARTBEAT_MS,
  LASER_STALE_MS,
  pointOnSlide,
} from "../../src/runtime/laser.ts";

/** Timers and frames a test fires by hand, in the order they were set. */
function clock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { fn: () => void; at: number }>();
  const frames: Array<() => void> = [];
  return {
    setTimer: (fn: () => void, ms: number): number => {
      const id = nextId++;
      timers.set(id, { fn, at: now + ms });
      return id;
    },
    clearTimer: (id: number): void => {
      timers.delete(id);
    },
    frame: (fn: () => void): void => {
      frames.push(fn);
    },
    /** Run the frames asked for so far. */
    paint(): void {
      for (const fn of frames.splice(0)) {
        fn();
      }
    },
    /** Move time on by `ms`, firing each timer that falls due. */
    advance(ms: number): void {
      const until = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= until)
          .sort(([, a], [, b]) => a.at - b.at)[0];
        if (!due) {
          break;
        }
        const [id, timer] = due;
        timers.delete(id);
        now = timer.at;
        timer.fn();
      }
      now = until;
    },
  };
}

const at = (x: number, y: number, slideIndex = 0): Pointer => ({ slideIndex, x, y });

describe("pointOnSlide", () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 };

  test("says where on the slide a point falls, as a share of each side", () => {
    expect(pointOnSlide({ x: 100, y: 50 }, rect)).toEqual({ x: 0, y: 0 });
    expect(pointOnSlide({ x: 300, y: 100 }, rect)).toEqual({ x: 0.5, y: 0.25 });
    expect(pointOnSlide({ x: 500, y: 250 }, rect)).toEqual({ x: 1, y: 1 });
  });

  test("finds nothing off the slide, or on a slide that has no size yet", () => {
    expect(pointOnSlide({ x: 99, y: 100 }, rect)).toBeUndefined();
    expect(pointOnSlide({ x: 300, y: 251 }, rect)).toBeUndefined();
    expect(pointOnSlide({ x: 0, y: 0 }, { left: 0, top: 0, width: 0, height: 0 })).toBeUndefined();
  });
});

describe("createLaserFeed", () => {
  function feed() {
    const time = clock();
    const sent: Array<Pointer | null> = [];
    const laser = createLaserFeed({ send: (pointer) => sent.push(pointer), ...time });
    return { time, sent, laser };
  }

  test("sends the latest point once a frame, however many moves came before it", () => {
    const { time, sent, laser } = feed();
    laser.point(at(0.1, 0.1));
    laser.point(at(0.2, 0.2));
    expect(sent).toEqual([]);
    time.paint();
    expect(sent).toEqual([at(0.2, 0.2)]);
    time.paint();
    expect(sent).toEqual([at(0.2, 0.2)]);
  });

  test("says again where it points while the hand holds still, so no one takes it for gone", () => {
    const { time, sent, laser } = feed();
    laser.point(at(0.3, 0.4));
    time.paint();
    time.advance(LASER_HEARTBEAT_MS * 2);
    expect(sent).toEqual([at(0.3, 0.4), at(0.3, 0.4), at(0.3, 0.4)]);
    expect(LASER_HEARTBEAT_MS * 2).toBeLessThan(LASER_STALE_MS);
  });

  test("lifts once, and then goes quiet", () => {
    const { time, sent, laser } = feed();
    laser.point(at(0.3, 0.4));
    time.paint();
    laser.lift();
    time.advance(LASER_HEARTBEAT_MS * 3);
    laser.lift();
    expect(sent).toEqual([at(0.3, 0.4), null]);
  });

  test("never sends a point the hand took away within the same frame", () => {
    const { time, sent, laser } = feed();
    laser.point(at(0.3, 0.4));
    laser.lift();
    time.paint();
    expect(sent).toEqual([]);
  });

  test("sends nothing to lift when it never pointed", () => {
    const { sent, laser } = feed();
    laser.lift();
    expect(sent).toEqual([]);
  });
});

describe("createLaserDot", () => {
  function dot(current = 0) {
    const time = clock();
    const drawn: Array<Pointer | null> = [];
    let slide = current;
    const laser = createLaserDot({
      draw: (pointer) => drawn.push(pointer),
      current: () => slide,
      ...time,
    });
    return { time, drawn, laser, moveTo: (index: number) => (slide = index) };
  }

  test("draws each point it hears, and hides at the word", () => {
    const { drawn, laser } = dot();
    laser.receive(at(0.5, 0.5));
    laser.receive(null);
    expect(drawn).toEqual([at(0.5, 0.5), null]);
  });

  test("hides a point no one has confirmed for a while: its sender may be gone", () => {
    const { time, drawn, laser } = dot();
    laser.receive(at(0.5, 0.5));
    time.advance(LASER_STALE_MS - 1);
    laser.receive(at(0.5, 0.5));
    time.advance(LASER_STALE_MS - 1);
    expect(drawn).toEqual([at(0.5, 0.5), at(0.5, 0.5)]);
    time.advance(1);
    expect(drawn.at(-1)).toBeNull();
  });

  test("shows a point only on the slide it was made on", () => {
    const { drawn, laser, moveTo } = dot(1);
    laser.receive(at(0.5, 0.5, 0));
    expect(drawn).toEqual([null]);
    laser.receive(at(0.5, 0.5, 1));
    moveTo(2);
    laser.sync();
    expect(drawn).toEqual([null, at(0.5, 0.5, 1), null]);
  });
});
