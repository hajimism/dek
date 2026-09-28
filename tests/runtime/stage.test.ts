import { describe, expect, test } from "bun:test";
import { announcement, isFinishable, motionModeFor } from "../../src/runtime/stage.ts";

const deck = [
  { slug: "a", stops: 2 },
  { slug: "b", stops: 1 },
];
const at = (slideIndex: number, beatIndex = 0) => ({ slideIndex, beatIndex });
const plain = { videoMode: false, reducedMotion: false };

describe("motionModeFor", () => {
  test("animates a move one beat forward, even onto the next slide", () => {
    expect(motionModeFor(at(0), at(0, 1), deck, plain)).toBe("animate");
    expect(motionModeFor(at(0, 1), at(1), deck, plain)).toBe("animate");
  });

  test("jumps to the end of any other move", () => {
    expect(motionModeFor(at(0, 1), at(0), deck, plain)).toBe("final");
    expect(motionModeFor(at(0), at(1), deck, plain)).toBe("final");
    expect(motionModeFor(at(1), at(1), deck, plain)).toBe("final");
  });

  test("never animates for a viewer who asks for less motion", () => {
    expect(motionModeFor(at(0), at(0, 1), deck, { ...plain, reducedMotion: true })).toBe("final");
  });

  test("holds every move for the video recorder, which seeks the motion itself", () => {
    expect(motionModeFor(at(0), at(0, 1), deck, { videoMode: true, reducedMotion: true })).toBe(
      "hold",
    );
  });
});

describe("announcement", () => {
  const slides = [{ title: "Intro" }, { title: "Outro" }];

  test("names the slide and where it stands in the deck", () => {
    expect(announcement(slides, at(1, 3))).toBe("Slide 2 of 2: Outro");
  });

  test("says nothing for a slide that is not there", () => {
    expect(announcement(slides, at(2))).toBeUndefined();
  });
});

describe("isFinishable", () => {
  const animation = (playState: string, endTime: unknown) => ({
    playState,
    effect: { getComputedTiming: () => ({ endTime }) },
  });

  test("finishes a running animation with an end", () => {
    expect(isFinishable(animation("running", 750))).toBe(true);
  });

  test("leaves endless, paused, and effect-less animations running", () => {
    expect(isFinishable(animation("running", Number.POSITIVE_INFINITY))).toBe(false);
    expect(isFinishable(animation("running", undefined))).toBe(false);
    expect(isFinishable(animation("paused", 750))).toBe(false);
    expect(isFinishable({ playState: "running", effect: null })).toBe(false);
  });
});
