import { describe, expect, test } from "bun:test";
import { logicalSize } from "../../src/core/size.ts";

describe("logicalSize", () => {
  test("maps 16:9 and 4:3 to slide pixels", () => {
    expect(logicalSize("16:9")).toEqual({ width: 1280, height: 720 });
    expect(logicalSize("4:3")).toEqual({ width: 1024, height: 768 });
    expect(logicalSize(undefined)).toEqual({ width: 1280, height: 720 });
  });
});
