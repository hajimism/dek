import { expect, test } from "bun:test";
import { mountChartDeck, unmountChartDeck } from "../helpers/chart-deck.ts";
import { playerChannelName, settle } from "../helpers/dom.ts";

// Bun shares BroadcastChannel across the whole test process, so a player left
// listening would touch `document` after happy-dom is gone.
test.serial("an unmounted player no longer hears the dek channel", async () => {
  await mountChartDeck("player");
  const name = playerChannelName();
  await unmountChartDeck();
  const errors: unknown[] = [];
  const onError = (error: unknown): void => {
    errors.push(error);
  };
  process.on("uncaughtException", onError);
  const channel = new BroadcastChannel(name);
  try {
    channel.postMessage({ slideIndex: 1, beatIndex: 0 });
    await settle();
    await settle();
  } finally {
    channel.close();
    process.off("uncaughtException", onError);
  }
  expect(errors).toEqual([]);
});

// happy-dom's window is the test process's globalThis, so what the player sets on it outlives
// the page: a dev page's dekLive would show up on the built file a later test mounts.
test.serial("an unmounted player leaves none of its hooks on window", async () => {
  await mountChartDeck("player");
  (window as { dekLive?: unknown }).dekLive = async () => undefined;
  await unmountChartDeck();
  for (const hook of ["dekGo", "dekMotion", "dekLive"]) {
    expect(globalThis).not.toHaveProperty(hook);
  }
});
