import { describe, expect, test } from "bun:test";
import { applyIncomingPosition, createGuardedGo } from "../../src/runtime/go.ts";

describe("createGuardedGo", () => {
  test("queues the latest move while a transition is in flight", async () => {
    const seen: number[] = [];
    let release: (() => void) | undefined;
    const go = createGuardedGo(async (next: number) => {
      seen.push(next);
      if (seen.length === 1) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
    });

    const first = go(1);
    await go(2);
    await go(3);
    release?.();
    await first;

    expect(seen).toEqual([1, 3]);
  });

  test("applies the latest queued move after a transition throws", async () => {
    const seen: number[] = [];
    let release: (() => void) | undefined;
    const go = createGuardedGo(async (next: number) => {
      seen.push(next);
      if (next === 1) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        throw new Error("boom");
      }
    });

    const first = go(1);
    await go(2);
    await go(3);
    release?.();
    await expect(first).rejects.toThrow("boom");
    expect(seen).toEqual([1, 3]);
  });
});

describe("createGuardedGo onQueue", () => {
  test("calls onQueue when a move waits behind one in flight, so that one can hurry", async () => {
    let release: (() => void) | undefined;
    let hurried = 0;
    const seen: number[] = [];
    const go = createGuardedGo(
      async (next: number) => {
        seen.push(next);
        if (next === 1) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
      },
      {
        onQueue: () => {
          hurried += 1;
          release?.();
        },
      },
    );

    const first = go(1);
    expect(hurried).toBe(0);
    await go(2);
    await first;

    expect(hurried).toBe(1);
    expect(seen).toEqual([1, 2]);
  });
});

describe("applyIncomingPosition", () => {
  test("does not call go when the incoming position equals current", async () => {
    const seen: number[] = [];
    const go = createGuardedGo(async (next: number) => {
      seen.push(next);
    });
    applyIncomingPosition(go, 1, { equal: (a, b) => a === b, current: () => 1 });
    await go(0);
    expect(seen).toEqual([0]);
  });

  test("queues the latest incoming move through go while a transition is in flight", async () => {
    const seen: number[] = [];
    let release: (() => void) | undefined;
    const go = createGuardedGo(async (next: number) => {
      seen.push(next);
      if (seen.length === 1) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
    });

    const first = go(1);
    applyIncomingPosition(go, 2, { equal: () => false, current: () => 1 });
    applyIncomingPosition(go, 3, { equal: () => false, current: () => 1 });
    release?.();
    await first;

    expect(seen).toEqual([1, 3]);
  });

  test("seeks instead of calling go when a seek handler is present", async () => {
    const seen: number[] = [];
    const sought: number[] = [];
    const go = createGuardedGo(async (next: number) => {
      seen.push(next);
    });
    applyIncomingPosition(go, 4, {
      equal: () => false,
      current: () => 0,
      seek: (next) => {
        sought.push(next);
      },
    });
    expect(seen).toEqual([]);
    expect(sought).toEqual([4]);
  });
});
