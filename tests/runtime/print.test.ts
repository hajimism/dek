import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { bar, mountChartDeck, unmountChartDeck } from "../helpers/chart-deck.ts";

beforeAll(async () => {
  await mountChartDeck("player", "file:///deck.html#chart/1");
});

afterAll(async () => {
  await unmountChartDeck();
});

describe("printing the player", () => {
  test("draws each slide at its last beat, as dekc pdf does, then the stage's beat again", () => {
    expect(bar()).toBe("1:base:0");
    window.dispatchEvent(new Event("beforeprint"));
    expect(bar()).toBe("2:growth:40");
    window.dispatchEvent(new Event("afterprint"));
    expect(bar()).toBe("1:base:0");
  });
});
