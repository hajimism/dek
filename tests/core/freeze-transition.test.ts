import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { freezeTransition, startGoPaused } from "../../src/core/freeze-transition.ts";

/** Runs the in-page callback right here, the way Playwright would in the browser. */
const page = {
  evaluate: async <T, A>(fn: (arg: A) => T | Promise<T>, arg?: A): Promise<T> => fn(arg as A),
};

const from = { slideIndex: 0, beatIndex: 0 };
const to = { slideIndex: 1, beatIndex: 0 };

beforeEach(() => {
  GlobalRegistrator.register();
});

afterEach(async () => {
  await GlobalRegistrator.unregister();
});

describe("freezeTransition", () => {
  test("holds the morph and the slide script at the same moment, in ms", async () => {
    const animation = {
      currentTime: null as number | null,
      pause() {},
      effect: { getComputedTiming: () => ({ delay: 0, duration: 400 }) },
    };
    const seeks: number[] = [];
    document.startViewTransition = ((update: () => void) => {
      update();
      return { ready: Promise.resolve(), finished: Promise.resolve() };
    }) as unknown as typeof document.startViewTransition;
    (document as { getAnimations: () => unknown[] }).getAnimations = () => [animation];
    window.dekGo = async (next) => {
      if (next?.slideIndex === 1) {
        document.startViewTransition(() => {});
      }
    };
    // The script's own motion is longer than the morph; it must not be scaled to it.
    window.dekMotion = { duration: () => 900, seek: (t) => seeks.push(t) };

    await freezeTransition(page, { from, to, at: 0.5 });

    expect(animation.currentTime).toBe(200);
    expect(seeks).toEqual([200]);
  });

  test("puts the page's startViewTransition back", async () => {
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

describe("startGoPaused", () => {
  test("starts the go, keeps it on window, and waits for its transition to be ready", async () => {
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
  });

  test("reports a go that opens no transition", async () => {
    window.dekGo = async () => {};
    expect(await startGoPaused(to)).toBe(false);
  });
});
