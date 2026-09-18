import { describe, expect, test } from "bun:test";
import { stepValuesForBeat } from "../../src/core/step.ts";

describe("stepValuesForBeat", () => {
  const beats = [{ id: "hook" }, { id: "point" }, {}];

  test("includes beat ids and 1-based numbers up to the current beat", () => {
    expect(stepValuesForBeat(beats, 0)).toEqual(new Set(["1", "hook"]));
    expect(stepValuesForBeat(beats, 1)).toEqual(new Set(["1", "2", "hook", "point"]));
    expect(stepValuesForBeat(beats, 2)).toEqual(new Set(["1", "2", "3", "hook", "point"]));
  });

  test("resolves mixed id and numeric data-step uniquely", () => {
    const shown = stepValuesForBeat([{ id: "hook" }, {}, { id: "end" }], 1);
    expect(shown.has("hook")).toBe(true);
    expect(shown.has("2")).toBe(true);
    expect(shown.has("end")).toBe(false);
  });
});
