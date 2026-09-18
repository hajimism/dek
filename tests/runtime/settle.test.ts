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

  test("ignores a rejected view transition finished promise", async () => {
    await waitForPlaybackSettle({
      viewTransition: { finished: Promise.reject(new Error("aborted")) },
    });
  });
});
