import { describe, expect, test } from "bun:test";
import { cuesFromDeck, splitSentences } from "../../src/core/cue.ts";
import { parseScript } from "../../src/core/parse.ts";
import {
  buildTimeline,
  playbackSchedule,
  sliceTimeline,
  slideVideoSeconds,
  timelineSeconds,
} from "../../src/core/timeline.ts";

describe("splitSentences", () => {
  test("splits on Japanese and ASCII terminals and newlines, keeping the mark", () => {
    expect(splitSentences("まず。つぎ！\n終わり？Yes!")).toEqual([
      "まず。",
      "つぎ！",
      "終わり？",
      "Yes!",
    ]);
  });

  test("does not split a sentence that has only a comma", () => {
    expect(splitSentences("まず script.md がいて、")).toEqual(["まず script.md がいて、"]);
  });

  test("splits English and fullwidth periods", () => {
    expect(splitSentences("Hello. Next.")).toEqual(["Hello.", "Next."]);
    expect(splitSentences("終わり．つぎ．")).toEqual(["終わり．", "つぎ．"]);
  });

  test("does not split file extensions or decimals", () => {
    expect(splitSentences("Open script.md then 3.0.")).toEqual(["Open script.md then 3.0."]);
  });
});

describe("buildTimeline", () => {
  const pause = { sentence: 350, beat: 700 };

  test("inserts sentence and beat pauses and keeps empty beats at the previous end", () => {
    const deck = parseScript(`---
title: Talk
---

## intro

Hello.

Next.

### spoken

### later
`);
    const cues = cuesFromDeck(deck);
    const timeline = buildTimeline(
      cues,
      [
        { text: "Hello.", kana: "ハロー", durationMs: 1000 },
        { text: "Next.", kana: "ネクスト", durationMs: 500 },
      ],
      pause,
      "audio.wav",
    );

    expect(timeline.audio).toBe("audio.wav");
    expect(timeline.beats).toHaveLength(2);
    expect(timeline.beats[0]?.sentences).toEqual([
      { text: "Hello.", kana: "ハロー", start: 0, end: 1000 },
      { text: "Next.", kana: "ネクスト", start: 1350, end: 1850 },
    ]);
    expect(timeline.beats[0]?.start).toBe(0);
    expect(timeline.beats[0]?.end).toBe(1850);
    expect(timeline.beats[1]?.sentences).toEqual([]);
    expect(timeline.beats[1]?.start).toBe(1850);
    expect(timeline.beats[1]?.end).toBe(2550);
    expect(timeline.durationMs).toBe(2550);
  });

  test("keeps duplicate sentences as separate utterances", () => {
    const timeline = buildTimeline(
      [
        {
          position: { slideIndex: 0, beatIndex: 0 },
          slug: "intro",
          line: 1,
          paragraphs: ["Hello."],
        },
        {
          position: { slideIndex: 1, beatIndex: 0 },
          slug: "again",
          line: 2,
          paragraphs: ["Hello."],
        },
      ],
      [
        { text: "Hello.", kana: "one", durationMs: 1000 },
        { text: "Hello.", kana: "two", durationMs: 400 },
      ],
      pause,
    );
    expect(timeline.beats[0]?.sentences[0]).toMatchObject({ kana: "one", end: 1000 });
    expect(timeline.beats[1]?.sentences[0]).toMatchObject({ kana: "two", start: 1700, end: 2100 });
    expect(timeline.durationMs).toBe(2800);
  });

  test("stacks pause.beat for consecutive empty beats after speech", () => {
    const deck = parseScript(`---
title: Talk
---

## intro

Hello.

### a

### b

### c
`);
    const timeline = buildTimeline(
      cuesFromDeck(deck),
      [{ text: "Hello.", kana: "", durationMs: 1000 }],
      pause,
    );
    expect(timeline.beats).toHaveLength(3);
    expect(timeline.beats[1]?.start).toBe(1000);
    expect(timeline.beats[1]?.end).toBe(1700);
    expect(timeline.beats[2]?.start).toBe(1700);
    expect(timeline.beats[2]?.end).toBe(2400);
    expect(timeline.durationMs).toBe(2400);
  });

  test("playbackSchedule subtracts lead-in from beat start", () => {
    const timeline = buildTimeline(
      [
        {
          position: { slideIndex: 0, beatIndex: 0 },
          slug: "intro",
          line: 1,
          paragraphs: ["Hello."],
        },
        {
          position: { slideIndex: 0, beatIndex: 1 },
          slug: "intro",
          line: 2,
          paragraphs: ["Next."],
        },
      ],
      [
        { text: "Hello.", kana: "", durationMs: 1000 },
        { text: "Next.", kana: "", durationMs: 1000 },
      ],
      pause,
    );
    expect(playbackSchedule(timeline, () => 300)).toEqual([
      { at: 0, position: { slideIndex: 0, beatIndex: 0 } },
      { at: 1400, position: { slideIndex: 0, beatIndex: 1 } },
    ]);
  });
});

describe("slideVideoSeconds", () => {
  test("attributes time until the next slide, using duration for the last", () => {
    const timeline = {
      audio: "",
      durationMs: 8000,
      beats: [
        {
          position: { slideIndex: 0, beatIndex: 0 },
          start: 0,
          end: 3000,
          sentences: [],
        },
        {
          position: { slideIndex: 1, beatIndex: 0 },
          start: 3700,
          end: 8000,
          sentences: [],
        },
      ],
    };
    expect(timelineSeconds(timeline)).toBe(8);
    expect(slideVideoSeconds(timeline, 0)).toBe(4);
    expect(slideVideoSeconds(timeline, 1)).toBe(4);
    expect(slideVideoSeconds(timeline, 2)).toBeUndefined();
  });
});

describe("sliceTimeline", () => {
  test("keeps one slide and shifts times to zero", () => {
    const timeline = {
      audio: "a.wav",
      durationMs: 3000,
      beats: [
        {
          position: { slideIndex: 0, beatIndex: 0 },
          start: 0,
          end: 1000,
          sentences: [{ text: "a", kana: "ア", start: 0, end: 1000 }],
        },
        {
          position: { slideIndex: 1, beatIndex: 0 },
          start: 1700,
          end: 2500,
          sentences: [{ text: "b", kana: "イ", start: 1700, end: 2500 }],
        },
      ],
    };
    const sliced = sliceTimeline(timeline, 1);
    expect(sliced.beats).toHaveLength(1);
    expect(sliced.beats[0]?.start).toBe(0);
    expect(sliced.beats[0]?.sentences[0]?.start).toBe(0);
    expect(sliced.durationMs).toBe(1300);
    expect(sliced.audio).toBe("a.wav");
  });

  test("includes trailing beat pause up to the next slide start", () => {
    const timeline = {
      audio: "a.wav",
      durationMs: 3000,
      beats: [
        {
          position: { slideIndex: 0, beatIndex: 0 },
          start: 0,
          end: 1000,
          sentences: [{ text: "a", kana: "ア", start: 0, end: 1000 }],
        },
        {
          position: { slideIndex: 1, beatIndex: 0 },
          start: 1700,
          end: 2500,
          sentences: [{ text: "b", kana: "イ", start: 1700, end: 2500 }],
        },
      ],
    };
    expect(sliceTimeline(timeline, 0).durationMs).toBe(1700);
  });
});
