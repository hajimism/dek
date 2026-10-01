import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { lintDeck } from "../../src/core/lint.ts";

const sampleDeck = join(import.meta.dir, "..", "..", "sample", "decks", "why-dekc");

describe("sample", () => {
  test("the bundled deck passes lint with no diagnostics", () => {
    expect(lintDeck(sampleDeck)).toEqual([]);
  });
});
