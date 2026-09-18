import { describe, expect, test } from "bun:test";
import { mergeSarif, type SarifLog, toSarif } from "../../src/core/sarif.ts";

const rumdl: SarifLog = {
  version: "2.1.0",
  $schema: "https://json.schemastore.org/sarif-2.1.0.json",
  runs: [
    {
      tool: { driver: { name: "rumdl" } },
      results: [{ ruleId: "MD013", message: { text: "line too long" } }],
    },
  ],
};

describe("mergeSarif", () => {
  test("concatenates dek and rumdl runs", () => {
    const merged = mergeSarif(
      toSarif([{ id: "DEK001", message: 'missing slide HTML for "intro"' }]),
      rumdl,
    );
    expect(merged.version).toBe("2.1.0");
    expect(merged.runs.map((run) => run.tool.driver.name)).toEqual(["dek", "rumdl"]);
    expect(merged.runs[0]?.results[0]?.ruleId).toBe("DEK001");
    expect(merged.runs[1]?.results[0]?.ruleId).toBe("MD013");
  });

  test("keeps the dek run when rumdl is missing", () => {
    const dek = toSarif([]);
    expect(mergeSarif(dek).runs).toHaveLength(1);
    expect(mergeSarif(dek).runs[0]?.tool.driver.name).toBe("dek");
  });
});
