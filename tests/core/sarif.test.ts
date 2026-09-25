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
      toSarif([{ id: "DEK001", severity: "error", message: 'missing slide HTML for "intro"' }]),
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

describe("toSarif", () => {
  const diagnostic = {
    id: "DEK011",
    severity: "error",
    message: "slide contains a style attribute",
    path: "/tmp/talks/decks/demo/slides/intro.html",
    line: 3,
    column: 27,
    slug: "intro",
    hint: "move it to a class in slides/intro.css, using token var()",
    data: { kind: "attribute", name: "style", value: "color: red" },
  } as const;

  test("keeps the message as written and the hint, slug, and data as properties", () => {
    const [result] = toSarif([diagnostic]).runs[0]?.results ?? [];
    expect(result).toEqual({
      ruleId: "DEK011",
      level: "error",
      message: { text: "slide contains a style attribute" },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: "file:///tmp/talks/decks/demo/slides/intro.html" },
            region: { startLine: 3, startColumn: 27 },
          },
        },
      ],
      properties: {
        slug: "intro",
        hint: "move it to a class in slides/intro.css, using token var()",
        data: { kind: "attribute", name: "style", value: "color: red" },
      },
    });
  });

  test("writes a path as a file URI, escaping what a URI cannot hold", () => {
    const [result] =
      toSarif([{ ...diagnostic, path: "/tmp/my talks/スライド.html" }]).runs[0]?.results ?? [];
    expect(result?.locations?.[0]?.physicalLocation.artifactLocation.uri).toBe(
      "file:///tmp/my%20talks/%E3%82%B9%E3%83%A9%E3%82%A4%E3%83%89.html",
    );
  });

  test("sets the SARIF level from the severity", () => {
    const sarif = toSarif([
      { id: "DEK010", severity: "error", message: "class" },
      { id: "DEK040", severity: "warning", message: "word" },
    ]);
    expect(sarif.runs[0]?.results.map((r) => r.level)).toEqual(["error", "warning"]);
  });

  test("describes every rule with its default level and where it is documented", () => {
    const rules = toSarif([]).runs[0]?.tool.driver.rules ?? [];
    expect(rules.find((rule) => rule.id === "DEK024")).toEqual({
      id: "DEK024",
      defaultConfiguration: { level: "warning" },
      helpUri: "https://hajimism.github.io/dek/reference/lint.html",
    });
  });

  test("reports a skipped check as a tool execution notification, not as a pass", () => {
    const sarif = toSarif([], {
      skipped: [{ check: "rumdl", reason: "rumdl is not installed", hint: "install rumdl" }],
    });
    expect(sarif.runs[0]?.invocations).toEqual([
      {
        executionSuccessful: true,
        toolExecutionNotifications: [
          {
            level: "warning",
            message: { text: "rumdl: skipped (rumdl is not installed)" },
            descriptor: { id: "skipped/rumdl" },
            properties: { check: "rumdl", hint: "install rumdl" },
          },
        ],
      },
    ]);
  });

  test("is a structurally valid SARIF 2.1.0 log", () => {
    const sarif = toSarif([diagnostic, { id: "DEK018", severity: "error", message: "no theme" }], {
      skipped: [{ check: "visual", reason: "Playwright is not installed" }],
    });
    expect(sarif.version).toBe("2.1.0");
    for (const run of sarif.runs) {
      expect(typeof run.tool.driver.name).toBe("string");
      for (const invocation of run.invocations ?? []) {
        expect(typeof invocation.executionSuccessful).toBe("boolean");
        for (const note of invocation.toolExecutionNotifications ?? []) {
          expect(["none", "note", "warning", "error"]).toContain(note.level);
          expect(note.message.text.length).toBeGreaterThan(0);
        }
      }
      for (const result of run.results) {
        expect(result.message.text.length).toBeGreaterThan(0);
        expect(run.tool.driver.rules?.some((rule) => rule.id === result.ruleId)).toBe(true);
        for (const location of result.locations ?? []) {
          const { artifactLocation, region } = location.physicalLocation;
          expect(new URL(artifactLocation.uri).protocol).toBe("file:");
          expect(region?.startLine ?? 1).toBeGreaterThanOrEqual(1);
          expect(region?.startColumn ?? 1).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });
});
