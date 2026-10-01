import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { bar, mountChartDeck, unmountChartDeck } from "../helpers/chart-deck.ts";
import { dekcGo } from "../helpers/dom.ts";

beforeAll(async () => {
  await mountChartDeck("video");
});

afterAll(async () => {
  await unmountChartDeck();
});

describe("slide scripts in video mode", () => {
  test("hold at t=0 and expose the motion for the recorder to seek", async () => {
    await dekcGo({ slideIndex: 1, beatIndex: 2 });
    expect(bar()).toBe("2:growth:0");
    const motion = (
      window as unknown as { dekcMotion: { duration(): number; seek(t: number): void } }
    ).dekcMotion;
    expect(motion.duration()).toBe(40);
    motion.seek(25);
    expect(bar()).toBe("2:growth:25");
  });
});
