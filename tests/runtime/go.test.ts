import { describe, expect, test } from "bun:test";
import { createGuardedGo } from "../../src/runtime/go.ts";

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
