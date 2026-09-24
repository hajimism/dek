import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { measureSlideInPage } from "../../src/core/slide-measure.ts";

beforeEach(() => {
  GlobalRegistrator.register();
});

afterEach(async () => {
  await GlobalRegistrator.unregister();
});

describe("measureSlideInPage", () => {
  test("returns no slide when the page has none", () => {
    document.body.innerHTML = "<p>no slide</p>";
    expect(measureSlideInPage()).toEqual({ slideBox: undefined, elements: [] });
  });

  test("describes each element by tag, id, first authored class, and data-step", () => {
    document.body.innerHTML = `<section class="slide is-current">
  <h2 class="slide-title" id="t">題</h2>
  <ul>
    <li class="is-shown" data-step="slow">時間が
      かかる</li>
  </ul>
</section>`;
    const { elements } = measureSlideInPage();
    expect(elements.map((e) => [e.box, e.parent, e.text, e.ownText])).toEqual([
      ["h2#t.slide-title", -1, "題", true],
      ["ul", -1, "時間が かかる", false],
      ['li[data-step="slow"]', 1, "時間が かかる", true],
    ]);
  });
});
