import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../../src/core/config.ts";
import {
  formatClock,
  formatSectionScript,
  joinSectionBodies,
  sectionTiming,
  speechText,
} from "../../src/core/timing.ts";

const section = {
  body: "intro body",
  beats: [{ body: "beat one" }, { body: "" }, { body: "beat two" }],
};

describe("joinSectionBodies", () => {
  test("joins non-empty bodies with the given separator", () => {
    expect(joinSectionBodies(section, "\n")).toBe("intro body\nbeat one\nbeat two");
    expect(joinSectionBodies(section, "\n\n")).toBe("intro body\n\nbeat one\n\nbeat two");
  });
});

describe("speechText / formatSectionScript", () => {
  test("speechText uses a single newline", () => {
    expect(speechText(section)).toBe(joinSectionBodies(section, "\n"));
  });

  test("formatSectionScript uses a blank line", () => {
    expect(formatSectionScript(section)).toBe(joinSectionBodies(section, "\n\n"));
  });
});

describe("formatClock", () => {
  test("formats seconds as m:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(75)).toBe("1:15");
  });
});

describe("sectionTiming", () => {
  test("estimates CJK at 300 chars/min and latin at 130 words/min without a budget", () => {
    const rows = sectionTiming(
      [
        { slug: "intro", body: "あいうえお", beats: [] },
        { slug: "architecture", body: "a b c d e f g h i j k l m", beats: [] },
      ],
      undefined,
      DEFAULT_CONFIG,
    );
    expect(rows).toEqual([
      { slug: "intro", estimateSeconds: 1 },
      { slug: "architecture", estimateSeconds: 6 },
    ]);
  });

  test("ignores blockquotes and splits duration by character count", () => {
    const rows = sectionTiming(
      [
        { slug: "intro", body: "あいうえお\n\n> これは数えない", beats: [] },
        { slug: "architecture", body: "かきくけこさしすせそ", beats: [] },
      ],
      "10m",
      DEFAULT_CONFIG,
    );
    expect(rows).toEqual([
      { slug: "intro", estimateSeconds: 1, budgetSeconds: 200 },
      { slug: "architecture", estimateSeconds: 2, budgetSeconds: 400 },
    ]);
  });
});
