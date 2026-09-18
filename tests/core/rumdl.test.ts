import { describe, expect, test } from "bun:test";
import { rumdlDiagnostics } from "../../src/core/rumdl.ts";

const sample = JSON.stringify({
  version: "2.1.0",
  runs: [
    {
      tool: { driver: { name: "rumdl" } },
      results: [
        {
          ruleId: "MD013",
          message: { text: "line too long" },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: "script.md" },
                region: { startLine: 8 },
              },
            },
          ],
        },
      ],
    },
  ],
});

describe("rumdlDiagnostics", () => {
  test("maps rumdl SARIF to diagnostics", async () => {
    const diagnostics = await rumdlDiagnostics("script.md", async () => sample);
    expect(diagnostics).toEqual([
      { id: "MD013", message: "line too long", path: "script.md", line: 8 },
    ]);
  });

  test("returns an empty list when rumdl is missing", async () => {
    expect(await rumdlDiagnostics("script.md", async () => null)).toEqual([]);
  });

  test("returns an empty list for invalid JSON", async () => {
    expect(await rumdlDiagnostics("script.md", async () => "not json")).toEqual([]);
  });
});
