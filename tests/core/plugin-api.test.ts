import { expect, test } from "bun:test";
import type { CheckOutput, CheckResult, PluginManifest } from "@hajimism/dek/plugin";
import { type PluginManifest as Pinned, readManifest } from "../../src/core/plugin.ts";

test("a manifest written to the published type is one dek reads, and pins as that type", () => {
  const manifest = {
    schema: 1,
    name: "study",
    version: "0.1.0",
    check: {
      protocol: 1,
      rules: { STUDY001: { severity: "error", summary: "a sticker's words are not on its slide" } },
    },
    data: [{ path: "study.yaml" }],
  } satisfies PluginManifest<"STUDY">;
  const reading = readManifest(manifest, "study");
  expect(reading.ok).toBe(true);
  // What dek pins is still the published shape: the two cannot drift apart.
  const pinned: PluginManifest | undefined = reading.ok
    ? (reading.manifest satisfies Pinned)
    : undefined;
  expect(pinned).toEqual(manifest);
});

test("a check's output names only the rules its manifest declares", () => {
  const output: CheckOutput<"STUDY001"> = {
    version: "2.1.0",
    runs: [{ results: [{ ruleId: "STUDY001", message: { text: "x" } }] }],
  };
  const undeclared: CheckResult<"STUDY001"> = {
    // @ts-expect-error a rule the manifest does not declare
    ruleId: "STUDY009",
    message: { text: "x" },
  };
  expect([output, undeclared]).toHaveLength(2);
});
