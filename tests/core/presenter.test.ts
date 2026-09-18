import { describe, expect, test } from "bun:test";
import { type PresenterSlide, presenterState } from "../../src/core/presenter.ts";

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
    const state = presenterState(slides, { slideIndex: 1, beatIndex: 0 });
    expect(state.current.slug).toBe("architecture");
    expect(state.next).toBeNull();
    expect(state.script).toContain("body text");
    expect(state.currentBeat).toEqual({ id: "hook", title: "script.md が親" });
    expect(state.currentBeatIndex).toBe(0);
  });
});
