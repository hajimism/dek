import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { isInside, moduleFilePath } from "../../src/core/path.ts";

describe("moduleFilePath", () => {
  test("decodes a file URL the same way as fileURLToPath", () => {
    const url = "file:///tmp/playwright%20worker.ts";
    expect(moduleFilePath(url)).toBe(fileURLToPath(url));
    expect(moduleFilePath(url)).toBe("/tmp/playwright worker.ts");
  });

  test("accepts a URL object from import.meta.url", () => {
    const url = new URL("./playwright-worker.ts", import.meta.url);
    expect(moduleFilePath(url)).toBe(fileURLToPath(url));
  });
});

describe("isInside", () => {
  test("rejects paths that escape the root", () => {
    expect(isInside("/tmp/deck/assets/a.png", "/tmp/deck")).toBe(true);
    expect(isInside("/tmp/other/a.png", "/tmp/deck")).toBe(false);
  });
});
