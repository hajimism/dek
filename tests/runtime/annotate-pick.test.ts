import { afterAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import {
  candidatesAt,
  currentStop,
  describeElement,
  ringPoints,
  slideBox,
  slidePoint,
  windowPoint,
} from "../../src/runtime/annotate-pick.ts";

const window = new Window();
const { document } = window;

afterAll(() => window.happyDOM.close());

/** Elements by where they are written: a failed match on elements themselves never prints. */
const sources = (elements: readonly Element[]): string[] =>
  elements.map((el) => `${el.tagName.toLowerCase()}@${el.getAttribute("data-dek-source")}`);

/** A deck of two slides, the second on screen, and what each element is called. */
function mountDeck() {
  document.body.innerHTML = `<div id="deck">
  <section class="slide" data-slug="cover" data-dek-source="1:1" data-dek-class="slide"><p data-dek-source="2:3">cover</p></section>
  <section class="slide is-current" data-slug="plan" data-dek-source="1:1" data-dek-class="slide">
    <div class="lane" data-dek-source="2:3" data-dek-class="lane">
      <div class="chevron is-shown is-lit" data-dek-source="3:5" data-dek-class="chevron">画面 <b class="is-lit" data-dek-source="3:30">レイアウト</b>設計</div>
      <div class="arrow" data-dek-source="4:5" data-dek-class="arrow"></div>
      <div class="later" data-step="later" style="opacity: 0" data-dek-source="5:5" data-dek-class="later"><span data-dek-source="5:40">later</span></div>
      <span class="made-by-script">drawn</span>
    </div>
  </section>
</div>`;
  const $ = (selector: string) => document.querySelector(selector) as unknown as Element;
  return {
    deck: $("#deck") as HTMLElement,
    cover: $('[data-slug="cover"]'),
    coverText: $('[data-slug="cover"] p'),
    slide: $('[data-slug="plan"]'),
    lane: $(".lane"),
    chevron: $(".chevron"),
    bold: $(".chevron b"),
    arrow: $(".arrow"),
    later: $(".later"),
    laterText: $(".later span"),
    script: $(".made-by-script"),
  };
}

describe("candidatesAt", () => {
  test("lists what is under the point, then what is near, each before what it is in", () => {
    const el = mountDeck();
    const stacks = new Map<string, Element[]>([
      ["100,100", [el.bold, el.chevron, el.lane, el.slide, el.deck]],
      ["104,100", [el.arrow, el.lane, el.slide]],
    ]);
    const found = candidatesAt(
      { x: 100, y: 100 },
      el.slide,
      (x, y) => stacks.get(`${x},${y}`) ?? [],
    );
    // The arrow is only near, but it is in the lane, so it comes before the lane.
    expect(sources(found)).toEqual(sources([el.bold, el.chevron, el.arrow, el.lane, el.slide]));
  });

  test("takes only the slide on screen, and only elements whose source it knows", () => {
    const el = mountDeck();
    const found = candidatesAt({ x: 0, y: 0 }, el.slide, () => [
      el.script,
      el.coverText,
      el.cover,
      el.lane,
      el.slide,
    ]);
    expect(sources(found)).toEqual(sources([el.lane, el.slide]));
  });

  test("passes over what is not shown yet, and what is inside it", () => {
    const el = mountDeck();
    const found = candidatesAt({ x: 0, y: 0 }, el.slide, () => [el.laterText, el.later, el.lane]);
    expect(sources(found)).toEqual(sources([el.lane, el.slide]));
  });

  test("tries points all round the pointer, close enough to catch a one-pixel line", () => {
    const points = ringPoints({ x: 10, y: 10 });
    expect(points[0]).toEqual({ x: 10, y: 10 });
    // A one-pixel line 0.5 to 4.5 px away in any direction passes under one of the points.
    for (let degrees = 0; degrees < 180; degrees += 5) {
      const angle = (degrees * Math.PI) / 180;
      const normal = { x: Math.cos(angle), y: Math.sin(angle) };
      for (let away = 0.5; away <= 4.5; away += 0.25) {
        const hit = points.some(
          (p) => Math.abs((p.x - 10) * normal.x + (p.y - 10) * normal.y - away) <= 0.5,
        );
        expect({ degrees, away, hit }).toEqual({ degrees, away, hit: true });
      }
    }
  });
});

describe("describeElement", () => {
  test("names an element by its tag and its classes as written, not those added since", () => {
    const el = mountDeck();
    expect(describeElement(el.chevron, el.slide)).toEqual({
      source: "3:5",
      name: "div.chevron",
      text: "画面 レイアウト設計",
    });
    // Written with no class; a slide script gave it one.
    expect(describeElement(el.bold, el.slide).name).toBe("b");
    expect(describeElement(el.slide, el.slide)).toEqual({
      source: "1:1",
      name: "section.slide",
      text: "",
    });
  });

  test("cuts a long text short", () => {
    const el = mountDeck();
    el.arrow.textContent = "あ".repeat(50);
    expect(describeElement(el.arrow, el.slide).text).toBe(`${"あ".repeat(40)}…`);
  });
});

describe("slideBox", () => {
  test("measures in the slide's own pixels, however the stage scales it", () => {
    const el = mountDeck();
    Object.defineProperty(el.deck, "offsetWidth", { value: 1920 });
    el.deck.getBoundingClientRect = () =>
      ({ left: 100, top: 50, width: 960, height: 540 }) as DOMRect;
    el.arrow.getBoundingClientRect = () =>
      ({ left: 694.2, top: 193, width: 12, height: 145 }) as DOMRect;
    expect(slideBox(el.arrow, el.deck)).toEqual({ x: 1188, y: 286, width: 24, height: 290 });
  });
});

describe("slidePoint and windowPoint", () => {
  test("turn a point in the window into one on the slide, and back", () => {
    const el = mountDeck();
    Object.defineProperty(el.deck, "offsetWidth", { value: 1920 });
    el.deck.getBoundingClientRect = () =>
      ({ left: 100, top: 50, width: 960, height: 540 }) as DOMRect;
    expect(slidePoint({ x: 650, y: 350 }, el.deck)).toEqual({ x: 1100, y: 600 });
    expect(windowPoint({ x: 1100, y: 600 }, el.deck)).toEqual({ x: 650, y: 350 });
  });
});

describe("currentStop", () => {
  const slides = [
    { slug: "cover", beats: [] },
    { slug: "plan", beats: [{ id: "base" }, {}] },
  ];

  test("reads the slide and beat on screen from the hash, as `dekc shot --step` names it", () => {
    expect(currentStop("#plan/1", slides)).toEqual({ slideIndex: 1, step: "base" });
    expect(currentStop("#plan/2", slides)).toEqual({ slideIndex: 1, step: "2" });
    expect(currentStop("#plan", slides)).toEqual({ slideIndex: 1, step: "0" });
    expect(currentStop("", slides)).toEqual({ slideIndex: 0, step: "0" });
  });
});
