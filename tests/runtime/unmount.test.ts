import { expect, test } from "bun:test";
import { mountChartDeck, unmountChartDeck } from "../helpers/chart-deck.ts";
import { playerChannelName, settle } from "../helpers/dom.ts";

// Bun shares BroadcastChannel across the whole test process, so a player left
// listening would touch `document` after happy-dom is gone.
test("an unmounted player no longer hears the dek channel", async () => {
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
