import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { bar, mountChartDeck, unmountChartDeck } from "../helpers/chart-deck.ts";
import { dekGo, pressKey } from "../helpers/dom.ts";

beforeAll(async () => {
  await mountChartDeck("player", "file:///deck.html#chart");
});

afterAll(async () => {
  await unmountChartDeck();
});

describe("slide scripts in the player", () => {
  test("a forward step animates from t=0 to the declared motion", async () => {
    expect(bar()).toBe("0:base:0");
    const seen: number[] = [];
    const module = (
      window as unknown as {
        __dekSlides: Record<string, { draw: (slide: Element, frame: { t: number }) => void }>;
      }
    ).__dekSlides.chart;
    const draw = module?.draw;
    if (!module || !draw) {
      throw new Error("chart script not registered");
    }
    let finished: () => void = () => {};
    const done = new Promise<void>((resolve) => {
      finished = resolve;
    });
    module.draw = (slide: Element, frame: { t: number }) => {
      seen.push(frame.t);
      draw(slide, frame);
      if (frame.t === 40) {
        finished();
      }
    };
    pressKey("ArrowRight");
    // happy-dom's frame timing differs from a browser's, so only the ends are stable to assert.
    expect(bar()).toBe("1:growth:0");
    await done;
    expect(bar()).toBe("1:growth:40");
    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBe(40);
    module.draw = draw;
  });

  test("a jump draws the beat's end state", async () => {
    await dekGo({ slideIndex: 0, beatIndex: 0 });
    await dekGo({ slideIndex: 1, beatIndex: 1 });
    expect(bar()).toBe("1:growth:40");
  });

  test("the rail thumbnail is drawn in its end state too", () => {
    expect(
      document.querySelector('#dek-rail [data-slide-index="1"] .slide .bar')?.textContent,
    ).toBe("0:base:0");
  });
});
