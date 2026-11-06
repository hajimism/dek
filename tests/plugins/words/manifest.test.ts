import { expect, test } from "bun:test";
import { MANIFEST } from "../../../src/plugins/words/manifest.ts";

// A project accepts each change to what dek-words promises (ADR 36). When this fails, bump the
// version in manifest.ts with the change, so `dekc sync` shows it, then update the snapshot.
test("what dek-words promises changes only with its version", () => {
  expect(MANIFEST).toEqual({
    schema: 1,
    name: "words",
    version: "0.1.0",
    check: {
      protocol: 1,
      rules: {
        WORDS001: {
          severity: "warning",
          summary: "a word on the project's word list is in the deck",
        },
        WORDS002: { severity: "error", summary: "the word list or a deck's allows cannot be read" },
      },
    },
    data: [{ path: "words.yaml", in: "project" }, { path: "words.yaml" }],
  });
});
