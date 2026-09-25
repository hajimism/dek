import { describe, expect, test } from "bun:test";
import { waitForPlaybackSettle } from "../../src/runtime/settle.ts";

describe("waitForPlaybackSettle", () => {
  test("waits for a view transition and running animations", async () => {
    const order: string[] = [];
    await waitForPlaybackSettle({
      viewTransition: {
        finished: Promise.resolve().then(() => {
          order.push("vt");
        }),
      },
      animations: [
        {
          playState: "running",
          finished: Promise.resolve().then(() => {
            order.push("anim");
          }),
        },
        { playState: "finished" },
      ],
    });
    expect(order.sort()).toEqual(["anim", "vt"]);
  });

  test("does not wait for an animation that never ends", async () => {
    const settled = await Promise.race([
      waitForPlaybackSettle({
        animations: [
          {
            playState: "running",
            finished: new Promise(() => {}),
            effect: { getComputedTiming: () => ({ endTime: Number.POSITIVE_INFINITY }) },
          },
        ],
      }).then(() => "settled"),
      new Promise((resolve) => setTimeout(() => resolve("stuck"), 50)),
    ]);
    expect(settled).toBe("settled");
  });

  test("ignores a rejected view transition finished promise", async () => {
    await waitForPlaybackSettle({
      viewTransition: { finished: Promise.reject(new Error("aborted")) },
    });
  });

  // Bun fails the run on an unhandled rejection, so waiting is the assertion.
  test("handles the rejection of a skipped transition's ready", async () => {
    const skipped = new DOMException("Transition was skipped", "AbortError");
    await waitForPlaybackSettle({
      viewTransition: { ready: Promise.reject(skipped), finished: Promise.resolve() },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  test("passes on an error thrown by the transition's update, as a move without one would", async () => {
    const error = new Error("render failed");
    const updateCallbackDone = Promise.reject(error);
    await expect(
      waitForPlaybackSettle({
        viewTransition: {
          ready: Promise.reject(error).catch(() => undefined),
          updateCallbackDone,
          finished: Promise.reject(error).catch(() => undefined),
        },
      }),
    ).rejects.toBe(error);
  });
});
