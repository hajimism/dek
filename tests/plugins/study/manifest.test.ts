import { expect, test } from "bun:test";
import { MANIFEST } from "../../../src/plugins/study/manifest.ts";

// A project accepts each change to what dek-study promises (ADR 34). When this fails, bump the
// version in manifest.ts with the change, so `dekc sync` shows it, then update the snapshot.
test("what dek-study promises changes only with its version", () => {
  expect(MANIFEST).toEqual({
    schema: 1,
    name: "study",
    version: "0.1.0",
    check: {
      protocol: 1,
      rules: {
        STUDY001: { severity: "error", summary: "a sticker's words are not on its slide" },
        STUDY002: {
          severity: "warning",
          summary: "a sticker's words also show elsewhere on its slide",
        },
        STUDY003: { severity: "error", summary: "study.yaml cannot be read" },
      },
    },
    page: { api: 1, keys: ["r"] },
    data: [{ path: "study.yaml" }],
  });
});
