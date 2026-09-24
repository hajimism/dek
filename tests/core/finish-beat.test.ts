import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { finishBeat } from "../../src/core/finish-beat.ts";

type FakeAnimation = {
  calls: string[];
  currentTime: number | null;
  finish(): void;
  pause(): void;
  effect: { getComputedTiming: () => { endTime: number } };
};

function fakeAnimation(endTime: number): FakeAnimation {
  const calls: string[] = [];
  return {
    calls,
    currentTime: 120,
    finish() {
      if (!Number.isFinite(endTime)) {
        // What a browser does for an animation that repeats forever.
        throw new DOMException("infinite", "InvalidStateError");
      }
      calls.push("finish");
    },
    pause() {
      calls.push("pause");
    },
    effect: { getComputedTiming: () => ({ endTime }) },
  };
}

beforeEach(() => {
  GlobalRegistrator.register();
});

afterEach(async () => {
  await GlobalRegistrator.unregister();
});

describe("finishBeat", () => {
  test("runs every animation to its end and holds one that never ends at its first frame", () => {
    const entrance = fakeAnimation(900);
    const pulse = fakeAnimation(Number.POSITIVE_INFINITY);
    (document as { getAnimations: () => unknown[] }).getAnimations = () => [entrance, pulse];

    finishBeat();

    expect(entrance.calls).toEqual(["finish"]);
    expect(pulse.calls).toEqual(["pause"]);
    expect(pulse.currentTime).toBe(0);
  });

  test("draws the slide script at the end of its beat", () => {
    (document as { getAnimations: () => unknown[] }).getAnimations = () => [];
    const seeks: number[] = [];
    window.dekMotion = { duration: () => 1400, seek: (t) => seeks.push(t) };

    finishBeat();

    expect(seeks).toEqual([1400]);
  });

  test("is self-contained, so pages can run it from source", () => {
    const entrance = fakeAnimation(300);
    (document as { getAnimations: () => unknown[] }).getAnimations = () => [entrance];

    new Function(`(${finishBeat})();`)();

    expect(entrance.calls).toEqual(["finish"]);
  });
});
