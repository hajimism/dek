import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { bar, mountChartDeck, unmountChartDeck } from "../helpers/chart-deck.ts";
import { dekGo } from "../helpers/dom.ts";

beforeAll(async () => {
  await mountChartDeck("video");
});

afterAll(async () => {
  await unmountChartDeck();
});

describe("slide scripts in video mode", () => {
  test("hold at t=0 and expose the motion for the recorder to seek", async () => {
    await dekGo({ slideIndex: 1, beatIndex: 1 });
    expect(bar()).toBe("1:growth:0");
    const motion = (
      window as unknown as { dekMotion: { duration(): number; seek(t: number): void } }
    ).dekMotion;
    expect(motion.duration()).toBe(40);
    motion.seek(25);
    expect(bar()).toBe("1:growth:25");
  });
});
