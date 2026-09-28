import { describe, expect, test } from "bun:test";
import {
  nextPresenterTitle,
  type PresenterSlide,
  presenterState,
  reflowScript,
  withoutDirections,
} from "../../src/core/presenter.ts";

const slides: PresenterSlide[] = [
  {
    slug: "intro",
    title: "intro",
    script: "hello",
    beats: [],
  },
  {
    slug: "architecture",
    title: "architecture",
    script: "body text\n\nhook body",
    beats: [{ id: "hook", title: "script.md が親" }],
  },
];

describe("presenterState", () => {
  test("returns the current slide, next slide, and section script", () => {
    const state = presenterState(slides, { slideIndex: 0, beatIndex: 0 });
    expect(state.current.slug).toBe("intro");
    expect(state.next?.slug).toBe("architecture");
    expect(state.script).toBe("hello");
    expect(state.currentBeat).toBeNull();
    expect(state.currentBeatIndex).toBe(0);
  });

  test("highlights the current beat on the last slide", () => {
    const state = presenterState(slides, { slideIndex: 1, beatIndex: 1 });
    expect(state.current.slug).toBe("architecture");
    expect(state.next).toBeNull();
    expect(state.script).toContain("body text");
    expect(state.currentBeat).toEqual({ id: "hook", title: "script.md が親" });
    expect(state.currentBeatIndex).toBe(1);
  });

  test("highlights no beat as the slide arrives", () => {
    const state = presenterState(slides, { slideIndex: 1, beatIndex: 0 });
    expect(state.currentBeat).toBeNull();
  });
});

describe("nextPresenterTitle", () => {
  test("uses the next slide title when the current slide is on its last beat", () => {
    const state = presenterState(slides, { slideIndex: 0, beatIndex: 0 });
    expect(nextPresenterTitle(state)).toBe("architecture");
  });

  test("keeps the current title while more beats remain", () => {
    const multi: PresenterSlide[] = [
      {
        slug: "intro",
        title: "intro",
        script: "hello",
        beats: [{ title: "a" }, { title: "b" }],
      },
    ];
    const state = presenterState(multi, { slideIndex: 0, beatIndex: 0 });
    expect(nextPresenterTitle(state)).toBe("intro");
  });

  test("keeps the current title as a slide with beats arrives", () => {
    const state = presenterState(slides, { slideIndex: 1, beatIndex: 0 });
    expect(nextPresenterTitle(state)).toBe("architecture");
  });

  test("is empty on the last beat of the last slide", () => {
    const state = presenterState(slides, { slideIndex: 1, beatIndex: 1 });
    expect(nextPresenterTitle(state)).toBe("");
  });
});

describe("reflowScript", () => {
  test("joins soft-wrapped Japanese lines without a space", () => {
    expect(reflowScript("仕様が決まっていないことに\nすぐ気づけます。")).toBe(
      "仕様が決まっていないことにすぐ気づけます。",
    );
  });

  test("joins soft-wrapped Latin lines with one space", () => {
    expect(reflowScript("Slides exist so that\n  you can talk.")).toBe(
      "Slides exist so that you can talk.",
    );
  });

  test("keeps paragraphs, stage directions, lists, and code on their own lines", () => {
    const script = [
      "first line",
      "second line",
      "",
      "> 間を取る。",
      "> 次で問いかける。",
      "",
      "- one",
      "- two",
      "",
      "```",
      "a",
      "b",
      "```",
    ].join("\n");
    expect(reflowScript(script)).toBe(
      [
        "first line second line",
        "",
        "> 間を取る。",
        "> 次で問いかける。",
        "",
        "- one",
        "- two",
        "",
        "```",
        "a",
        "b",
        "```",
      ].join("\n"),
    );
  });
});

describe("withoutDirections", () => {
  test("drops stage directions and what the author hid in comments", () => {
    const script = [
      "> 目次は読み上げない。",
      "",
      "今日は三つ話します。<!-- 時間が押したら二つ -->",
      "",
      "<!--",
      "去年の失敗談はここで。",
      "-->",
      "",
      "最後に質問を受けます。",
    ].join("\n");
    expect(withoutDirections(script)).toBe(
      ["今日は三つ話します。", "", "最後に質問を受けます。"].join("\n"),
    );
  });

  test("keeps a quote or a comment that is code the slide shows", () => {
    const script = ["```sh", "> echo hi", "<!-- markup -->", "```", "", "> 間"].join("\n");
    expect(withoutDirections(script)).toBe(
      ["```sh", "> echo hi", "<!-- markup -->", "```"].join("\n"),
    );
  });

  test("leaves a script made only of directions empty", () => {
    expect(withoutDirections("> 間を取る。\n\n> 水を飲む。")).toBe("");
  });
});
