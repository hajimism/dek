import { describe, expect, test } from "bun:test";
import {
  beatAt,
  beatStep,
  lastStop,
  resolveStep,
  resolveStop,
  stepKey,
  stepValuesForBeat,
  stopCount,
} from "../../src/core/step.ts";

describe("stepValuesForBeat", () => {
  const beats = [{ id: "hook" }, { id: "point" }, {}];

  test("shows nothing as the slide arrives, then each beat reached, by id and 1-based number", () => {
    expect(stepValuesForBeat(beats, 0)).toEqual(new Set());
    expect(stepValuesForBeat(beats, 1)).toEqual(new Set(["1", "hook"]));
    expect(stepValuesForBeat(beats, 2)).toEqual(new Set(["1", "2", "hook", "point"]));
    expect(stepValuesForBeat(beats, 3)).toEqual(new Set(["1", "2", "3", "hook", "point"]));
  });

  test("resolves mixed id and numeric data-step uniquely", () => {
    const shown = stepValuesForBeat([{ id: "hook" }, {}, { id: "end" }], 2);
    expect(shown.has("hook")).toBe(true);
    expect(shown.has("2")).toBe(true);
    expect(shown.has("end")).toBe(false);
  });
});

describe("stepKey", () => {
  test("the arrival is 0; a beat is keyed by its id, or by its 1-based position like data-step", () => {
    const beats = [{ id: "what" }, {}];
    expect(stepKey(beats, 0)).toBe("0");
    expect(stepKey(beats, 1)).toBe("what");
    expect(stepKey(beats, 2)).toBe("2");
    expect(stepKey([], 0)).toBe("0");
  });

  test("beatStep names a beat by its 0-based index, as data-step does", () => {
    expect(beatStep([{ id: "what" }, {}], 0)).toBe("what");
    expect(beatStep([{ id: "what" }, {}], 1)).toBe("2");
  });

  test("a slide stops at its arrival and at each beat", () => {
    expect(stopCount([])).toBe(1);
    expect(stopCount([{}, {}])).toBe(3);
  });
});

describe("resolveStop", () => {
  const beats = [{ id: "hook" }, {}, { id: "end" }];

  test("takes 0 to the beat count by position", () => {
    expect(resolveStop(beats, "0")).toBe(0);
    expect(resolveStop(beats, "2")).toBe(2);
    expect(resolveStop(beats, "3")).toBe(3);
  });

  test("takes a beat id as the stop where that beat is reached", () => {
    expect(resolveStop(beats, "hook")).toBe(1);
    expect(resolveStop(beats, "end")).toBe(3);
  });

  test("refuses a stop past the last beat, an unknown id, and padded numbers", () => {
    expect(resolveStop(beats, "4")).toBeUndefined();
    expect(resolveStop(beats, "nope")).toBeUndefined();
    expect(resolveStop(beats, "01")).toBeUndefined();
    expect(resolveStop([], "1")).toBeUndefined();
    expect(resolveStop([], "0")).toBe(0);
  });
});

describe("resolveStep", () => {
  test("names a beat, never the arrival", () => {
    const beats = [{ id: "hook" }, {}];
    expect(resolveStep(beats, "hook")).toBe(1);
    expect(resolveStep(beats, "2")).toBe(2);
    expect(resolveStep(beats, "0")).toBeUndefined();
    expect(resolveStep(beats, "3")).toBeUndefined();
  });
});

describe("beatAt / lastStop", () => {
  const beats = [{ id: "hook" }, { id: "end" }];

  test("the arrival has no beat; stop k is the k-th beat", () => {
    expect(beatAt(beats, 0)).toBeUndefined();
    expect(beatAt(beats, 1)).toEqual({ id: "hook" });
    expect(beatAt(beats, 2)).toEqual({ id: "end" });
    expect(beatAt(beats, 3)).toBeUndefined();
  });

  test("the last stop has every beat reached", () => {
    expect(lastStop(beats)).toBe(2);
    expect(lastStop([])).toBe(0);
  });
});
