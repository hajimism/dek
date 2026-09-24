import { describe, expect, test } from "bun:test";
import { hasErrors, severityOf, withSeverity } from "../../src/core/diagnostic.ts";

describe("severityOf", () => {
  test("voice and timing rules are warnings", () => {
    for (const id of ["DEK040", "DEK041", "DEK042", "DEK043"]) {
      expect(severityOf({ id, message: "" })).toBe("warning");
    }
  });

  test("every other dek rule is an error", () => {
    for (const id of ["DEK001", "DEK010", "DEK016", "DEK030", "DEK031"]) {
      expect(severityOf({ id, message: "" })).toBe("error");
    }
  });

  test("diagnostics from outside the rule table are errors", () => {
    expect(severityOf({ id: "MD013", message: "" })).toBe("error");
    expect(severityOf({ id: "parse", message: "" })).toBe("error");
  });

  test("an explicit severity wins over the rule table", () => {
    expect(severityOf({ id: "DEK040", message: "", severity: "error" })).toBe("error");
  });
});

describe("hasErrors", () => {
  test("is false for warnings only", () => {
    expect(hasErrors([{ id: "DEK040", message: "" }])).toBe(false);
    expect(hasErrors([])).toBe(false);
  });

  test("is true when any diagnostic is an error", () => {
    expect(
      hasErrors([
        { id: "DEK040", message: "" },
        { id: "DEK010", message: "" },
      ]),
    ).toBe(true);
  });
});

describe("withSeverity", () => {
  test("fills in the severity from the rule table", () => {
    expect(withSeverity([{ id: "DEK040", message: "m" }])).toEqual([
      { id: "DEK040", message: "m", severity: "warning" },
    ]);
  });
});
