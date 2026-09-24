import { describe, expect, test } from "bun:test";
import { stillDrawScript } from "../../src/core/slide-draw.ts";
import {
  createMotion,
  drawAtEnd,
  type MotionFrame,
  motionMs,
  type SlideModule,
} from "../../src/runtime/motion.ts";

const beats = [{ id: "what" }, {}, { id: "growth" }];

function harness() {
  let clock = 0;
  let queued: (() => void) | undefined;
  let timer: (() => void) | undefined;
  const motion = createMotion({
    now: () => clock,
    setTimer: (fn) => {
      timer = fn;
      return 1;
    },
    clearTimer: () => {
      timer = undefined;
    },
    requestFrame: (fn) => {
      queued = fn;
      return 1;
    },
    cancelFrame: () => {
      queued = undefined;
    },
  });
  const tick = (ms: number): void => {
    clock += ms;
    const fn = queued;
    queued = undefined;
    fn?.();
  };
  const fireTimer = (ms: number): void => {
    clock += ms;
    const fn = timer;
    timer = undefined;
    fn?.();
  };
  return { motion, tick, fireTimer, pending: () => queued !== undefined };
}

function recorder(motion?: Record<string, number>) {
  const frames: MotionFrame[] = [];
  return {
    frames,
    module: {
      ...(motion ? { motion } : {}),
      draw: (_: unknown, frame: MotionFrame) => frames.push(frame),
    },
  };
}

const slide = {} as HTMLElement;

describe("motionMs", () => {
  test("motion is looked up by the same key and defaults to zero", () => {
    const module = { motion: { what: 400, 2: 900 } };
    expect(motionMs(module, beats, 0)).toBe(400);
    expect(motionMs(module, beats, 1)).toBe(900);
    expect(motionMs(module, beats, 2)).toBe(0);
    expect(motionMs(undefined, beats, 0)).toBe(0);
  });
});

describe("createMotion", () => {
  test("animate draws from t=0 on every frame until the declared motion ends", () => {
    const { motion, tick, pending } = harness();
    const { frames, module } = recorder({ growth: 100 });
    motion.show(slide, module, beats, 2, "animate");
    tick(40);
    tick(40);
    tick(40);
    expect(frames.map((frame) => frame.t)).toEqual([0, 40, 80, 100]);
    expect(frames[0]).toEqual({ index: 2, step: "growth", t: 0 });
    expect(pending()).toBe(false);
  });

  test("the end state lands even when animation frames stop arriving", () => {
    const { motion, fireTimer, pending } = harness();
    const { frames, module } = recorder({ growth: 100 });
    motion.show(slide, module, beats, 2, "animate");
    fireTimer(250);
    expect(frames.map((frame) => frame.t)).toEqual([0, 100]);
    expect(pending()).toBe(false);
  });

  test("final draws the end state once", () => {
    const { motion, pending } = harness();
    const { frames, module } = recorder({ growth: 100 });
    motion.show(slide, module, beats, 2, "final");
    expect(frames.map((frame) => frame.t)).toEqual([100]);
    expect(pending()).toBe(false);
  });

  test("hold draws t=0 and waits for seek, which clamps to the motion", () => {
    const { motion, pending } = harness();
    const { frames, module } = recorder({ growth: 100 });
    motion.show(slide, module, beats, 2, "hold");
    expect(motion.duration()).toBe(100);
    motion.seek(30);
    motion.seek(500);
    expect(frames.map((frame) => frame.t)).toEqual([0, 30, 100]);
    expect(pending()).toBe(false);
  });

  test("showing another slide stops the running animation", () => {
    const { motion, tick } = harness();
    const first = recorder({ growth: 100 });
    motion.show(slide, first.module, beats, 2, "animate");
    motion.show(slide, undefined, beats, 0, "animate");
    tick(50);
    expect(first.frames.map((frame) => frame.t)).toEqual([0]);
    expect(motion.duration()).toBe(0);
  });

  test("a throwing draw is reported and does not break the player", () => {
    const { motion } = harness();
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (error: unknown) => errors.push(error);
    try {
      motion.show(
        slide,
        {
          draw: () => {
            throw new Error("boom");
          },
        },
        beats,
        0,
        "final",
      );
    } finally {
      console.error = original;
    }
    expect(errors).toHaveLength(1);
  });
});

describe("drawAtEnd", () => {
  const slide = {} as HTMLElement;

  test("draws the beat's final frame, at the end of its motion", () => {
    const frames: MotionFrame[] = [];
    drawAtEnd(
      { motion: { growth: 900 }, draw: (_, frame) => frames.push(frame) },
      slide,
      2,
      "growth",
    );
    drawAtEnd(
      { motion: { growth: -1 }, draw: (_, frame) => frames.push(frame) },
      slide,
      2,
      "growth",
    );
    expect(frames).toEqual([
      { index: 2, step: "growth", t: 900 },
      { index: 2, step: "growth", t: 0 },
    ]);
  });

  test("skips a module without a draw function and reports one that throws", () => {
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (error: unknown) => errors.push(error);
    try {
      drawAtEnd(undefined, slide, 0, "1");
      drawAtEnd({ draw: 1 } as unknown as SlideModule, slide, 0, "1");
      drawAtEnd(
        {
          draw: () => {
            throw new Error("boom");
          },
        },
        slide,
        0,
        "1",
      );
    } finally {
      console.error = original;
    }
    expect(errors.map(String)).toEqual(["Error: boom"]);
  });
});

describe("stillDrawScript", () => {
  test("is self-contained and draws each marked slide with drawAtEnd", () => {
    const frames: unknown[] = [];
    const attrs = { "data-slug": "chart", "data-dek-beat": "1", "data-dek-step": "growth" };
    const chart = { getAttribute: (name: string) => attrs[name as keyof typeof attrs] ?? null };
    const unmarked = { getAttribute: (name: string) => (name === "data-slug" ? "chart" : null) };
    const window = {
      __dekSlides: {
        chart: { motion: { growth: 900 }, draw: (el: unknown, f: unknown) => frames.push([el, f]) },
      },
    };
    const document = { querySelectorAll: () => [chart, unmarked] };
    new Function("window", "document", stillDrawScript())(window, document);
    expect(frames).toEqual([[chart, { index: 1, step: "growth", t: 900 }]]);
  });
});
