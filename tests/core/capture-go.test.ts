import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { captureGo, freezeTransition } from "../../src/core/capture-go.ts";
import { finishBeat } from "../../src/core/finish-beat.ts";
import { holdStarted, seekStarted, startGoPaused } from "../../src/core/in-page-go.ts";

/** Runs the in-page callback right here, the way Playwright would in the browser. */
const page = {
  evaluate: async <T, A>(fn: (arg: A) => T | Promise<T>, arg?: A): Promise<T> => fn(arg as A),
};

const from = { slideIndex: 0, beatIndex: 0 };
const to = { slideIndex: 1, beatIndex: 0 };

// One global DOM for the whole file, so no two tests may overlap on it.
beforeEach(() => {
  GlobalRegistrator.register();
});

afterEach(async () => {
  await GlobalRegistrator.unregister();
});

type FakeAnimation = {
  currentTime: number | null;
  paused: boolean;
  finished: boolean;
  finish(): void;
  pause(): void;
  effect: {
    pseudoElement?: string;
    getComputedTiming(): { delay: number; duration: number; endTime: number };
  };
};

/** An animation that ends at `endTime` ms; Infinity for one that repeats forever. */
function fakeAnimation(endTime: number, pseudoElement?: string): FakeAnimation {
  return {
    currentTime: null,
    paused: false,
    finished: false,
    finish() {
      this.finished = true;
    },
    pause() {
      this.paused = true;
    },
    effect: {
      ...(pseudoElement ? { pseudoElement } : {}),
      getComputedTiming: () => ({ delay: 0, duration: endTime, endTime }),
    },
  };
}

/** The page's animations: what is already running, plus whatever each go starts. */
function fakePage(starts: Record<number, FakeAnimation[]>, running: FakeAnimation[] = []) {
  const live = [...running];
  (document as { getAnimations: () => unknown[] }).getAnimations = () => [...live];
  document.startViewTransition = ((update: () => void) => {
    update();
    return { ready: Promise.resolve(), finished: Promise.resolve() };
  }) as unknown as typeof document.startViewTransition;
  window.dekGo = async (next) => {
    const started = starts[next?.slideIndex ?? -1] ?? [];
    live.push(...started);
    if (started.some((animation) => animation.effect.pseudoElement)) {
      document.startViewTransition(() => {});
    }
  };
}

describe("freezeTransition", () => {
  test.serial("holds the morph and the slide script at the same moment, in ms", async () => {
    const morph = fakeAnimation(400, "::view-transition-new(slide)");
    fakePage({ 1: [morph] });
    const seeks: number[] = [];
    // The script's own motion is longer than the morph; it must not be scaled to it.
    window.dekMotion = { duration: () => 900, seek: (t) => seeks.push(t) };

    await freezeTransition(page, { from, to, at: 0.5 });

    expect(morph.currentTime).toBe(200);
    // The first seek ends the beat being left; the second is the morph's moment.
    expect(seeks).toEqual([900, 200]);
  });

  test.serial(
    "stops every animation at one moment of the transition, not at its own midpoint",
    async () => {
      const morph = fakeAnimation(600, "::view-transition-group(window)");
      const fade = fakeAnimation(300, "::view-transition-new(slide)");
      const entrance = fakeAnimation(2000);
      fakePage({ 1: [morph, fade, entrance] });
      const seeks: number[] = [];
      window.dekMotion = { duration: () => 900, seek: (t) => seeks.push(t) };

      await freezeTransition(page, { from, to, at: 0.5 });

      // Half of the 600ms transition: the 300ms fade is over, the slide's entrance is 300ms in.
      expect([morph.currentTime, fade.currentTime, entrance.currentTime]).toEqual([300, 300, 300]);
      expect(seeks).toEqual([900, 300]);
    },
  );

  test.serial(
    "leaves the page it transitions from at the end of its beat, and does not rewind it",
    async () => {
      const left = fakeAnimation(400);
      const morph = fakeAnimation(400, "::view-transition-new(slide)");
      fakePage({ 0: [left], 1: [morph] });
      window.dekMotion = { duration: () => 0, seek: () => {} };

      await freezeTransition(page, { from, to, at: 0.5 });

      expect(left.finished).toBe(true);
      expect(left.currentTime).toBeNull();
      expect(morph.currentTime).toBe(200);
    },
  );

  test.serial(
    "ends a go that opens no view transition, as a still of its beat ends it",
    async () => {
      const entrance = fakeAnimation(400);
      fakePage({ 1: [entrance] });
      const seeks: number[] = [];
      window.dekMotion = { duration: () => 900, seek: (t) => seeks.push(t) };

      await freezeTransition(page, { from, to, at: 0.5 });

      expect(entrance.finished).toBe(true);
      expect(seeks).toEqual([900, 900]);
    },
  );

  test.serial("puts the page's startViewTransition back", async () => {
    const original = ((update: () => void) => {
      update();
      return { ready: Promise.resolve(), finished: Promise.resolve() };
    }) as unknown as typeof document.startViewTransition;
    document.startViewTransition = original;
    (document as { getAnimations: () => unknown[] }).getAnimations = () => [];
    window.dekGo = async () => {
      document.startViewTransition(() => {});
    };

    await freezeTransition(page, { from, to, at: 0.5 });

    expect(document.startViewTransition).toBe(original);
  });
});

describe("holdStarted and seekStarted", () => {
  test.serial(
    "hold the animations the last go started, and nothing that ran before it",
    async () => {
      const earlier = fakeAnimation(1200);
      const reveal = fakeAnimation(300);
      const pulse = fakeAnimation(Number.POSITIVE_INFINITY);
      fakePage({ 1: [reveal, pulse] }, [earlier]);
      window.dekMotion = undefined;
      finishBeat();
      earlier.currentTime = null;
      const seeks: number[] = [];
      window.dekMotion = { duration: () => 500, seek: (t) => seeks.push(t) };

      await startGoPaused(to);
      // The longest finite end, the slide script's motion included; a loop has no end.
      expect(holdStarted()).toBe(500);
      expect([reveal.paused, pulse.paused, earlier.paused]).toEqual([true, true, false]);

      seekStarted(250);
      expect([reveal.currentTime, pulse.currentTime, earlier.currentTime]).toEqual([
        250,
        250,
        null,
      ]);
      expect(seeks).toEqual([250]);
    },
  );

  test.serial(
    "count what has run since the page loaded when no beat was finished before the go",
    async () => {
      const entrance = fakeAnimation(800);
      const reveal = fakeAnimation(300);
      fakePage({ 1: [reveal] }, [entrance]);
      window.__dekSettled = undefined;
      window.dekMotion = undefined;

      await startGoPaused(to);

      expect(holdStarted()).toBe(800);
      expect([entrance.paused, reveal.paused]).toEqual([true, true]);
    },
  );

  test.serial("count every animation on the page as started when no go ran", () => {
    const entrance = fakeAnimation(800);
    fakePage({}, [entrance]);
    window.__dekStarted = undefined;
    window.dekMotion = undefined;

    expect(holdStarted()).toBe(800);
  });
});

describe("startGoPaused", () => {
  test.serial(
    "starts the go, keeps it on window, and waits for its transition to be ready",
    async () => {
      fakePage({});
      let ready = false;
      document.startViewTransition = ((update: () => void) => {
        update();
        return {
          ready: Promise.resolve().then(() => {
            ready = true;
          }),
          finished: Promise.resolve(),
        };
      }) as unknown as typeof document.startViewTransition;
      const seen: unknown[] = [];
      window.dekGo = async (next) => {
        seen.push(next);
        document.startViewTransition(() => {});
      };

      expect(await startGoPaused(to)).toBe(true);
      expect(ready).toBe(true);
      expect(seen).toEqual([to]);
      expect(window.__dekPendingGo).toBeInstanceOf(Promise);
    },
  );

  test.serial("reports a go that opens no transition", async () => {
    fakePage({});
    window.dekGo = async () => {};
    expect(await startGoPaused(to)).toBe(false);
  });
});

describe("captureGo", () => {
  test.serial("shoots the go at each stop of its span, then at its settled end", async () => {
    const reveal = fakeAnimation(400);
    fakePage({ 1: [reveal] });
    window.__dekSettled = new Set();
    window.dekMotion = undefined;
    const shots: Array<[number, boolean, number | null]> = [];

    const span = await captureGo(
      page,
      to,
      (ms) => [0, ms / 2],
      async (ms, end) => {
        shots.push([ms, end, reveal.currentTime]);
      },
    );

    expect(span).toBe(400);
    expect(shots).toEqual([
      [0, false, 0],
      [200, false, 200],
      [400, true, 200],
    ]);
    expect(reveal.finished).toBe(true);
  });

  test.serial("shoots the end only once the go it ended has returned", async () => {
    fakePage({});
    window.__dekSettled = new Set();
    window.dekMotion = undefined;
    let returned = false;
    window.dekGo = async () => {
      await Bun.sleep(20);
      returned = true;
    };
    const atEnd: boolean[] = [];

    await captureGo(
      page,
      to,
      () => [],
      async (_ms, end) => {
        atEnd.push(end && returned);
      },
    );

    expect(atEnd).toEqual([true]);
  });

  test.serial("shoots only the end of a go that moves nothing", async () => {
    fakePage({});
    window.__dekSettled = new Set();
    window.dekMotion = undefined;
    const shots: number[] = [];

    await captureGo(
      page,
      to,
      (ms) => (ms > 0 ? [ms] : []),
      async (ms) => {
        shots.push(ms);
      },
    );

    expect(shots).toEqual([0]);
  });
});
