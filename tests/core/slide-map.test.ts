import { describe, expect, test } from "bun:test";
import type { Deck } from "../../src/core/schema.ts";
import { slideMap } from "../../src/core/slide-map.ts";
import { SlideMap } from "../../src/pub/protocol.ts";

const deck = {
  title: "Why dek",
  sections: [
    {
      slug: "intro",
      title: "はじめに",
      body: "今日は **dek** の話をします。\n二行目です。\n\n> ここで間を取る\n\n- 箇条書きは話さない",
      beats: [],
      line: 5,
    },
    {
      slug: "speed",
      title: "Speed",
      body: "It got faster.",
      beats: [
        { id: "chart", title: "The chart", body: "Three times faster.", line: 14 },
        { title: "Then", body: "And smaller.", line: 18 },
      ],
      line: 10,
    },
  ],
} as unknown as Deck;

describe("slideMap", () => {
  test("lists each slide's heading, steps, and the paragraphs said aloud", () => {
    const map = slideMap({ name: "why-dek", deck }, "dist/why-dek.html", "speaker");
    expect(SlideMap.parse(map)).toEqual(map);
    expect(map.deck).toBe("why-dek");
    expect(map.out).toBe("dist/why-dek.html");
    expect(map.slides.map((slide) => [slide.slug, slide.title, slide.line])).toEqual([
      ["intro", "はじめに", 5],
      ["speed", "Speed", 10],
    ]);
    expect(map.slides[1]?.steps).toEqual([
      { step: "0", title: "Speed" },
      { step: "chart", id: "chart", title: "The chart" },
      { step: "2", title: "Then" },
    ]);
    expect(map.slides[0]?.paragraphs).toEqual(["今日は dek の話をします。二行目です。"]);
    expect(map.slides[1]?.paragraphs).toEqual([
      "It got faster.",
      "Three times faster.",
      "And smaller.",
    ]);
  });

  test("leaves the stage directions out of the script an audience reads", () => {
    const speaker = slideMap({ name: "why-dek", deck }, "out.html", "speaker");
    const audience = slideMap({ name: "why-dek", deck }, "out.html", "audience");
    expect(speaker.slides[0]?.script).toContain("ここで間を取る");
    expect(audience.slides[0]?.script).not.toContain("ここで間を取る");
    expect(audience.slides[0]?.script).toContain("今日は **dek** の話をします。");
  });
});
