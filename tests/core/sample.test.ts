import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { lintDeck } from "../../src/core/lint.ts";

const sampleDecks = join(import.meta.dir, "..", "..", "sample", "decks");

describe("sample", () => {
  test.each(readdirSync(sampleDecks))(
    "the bundled deck %s passes lint with no diagnostics",
    (deck) => {
      expect(lintDeck(join(sampleDecks, deck))).toEqual([]);
    },
  );
});
