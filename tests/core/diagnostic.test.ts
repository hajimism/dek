import { describe, expect, test } from "bun:test";
import {
  diag,
  errorDiagnostic,
  hasErrors,
  RULES,
  type RuleId,
  uniqueDiagnostics,
} from "../../src/core/diagnostic.ts";

describe("diag", () => {
  test("voice and timing rules, and input dek ignores or reads another way, are warnings", () => {
    for (const id of ["DEK008", "DEK040", "DEK041", "DEK042", "DEK043", "DEK044"] as const) {
      expect(diag(id, { message: "" }).severity).toBe("warning");
    }
  });

  test("every other dek rule is an error", () => {
    for (const id of ["DEK001", "DEK009", "DEK010", "DEK016", "DEK019", "DEK030"] as const) {
      expect(diag(id, { message: "" }).severity).toBe("error");
    }
  });

  test("puts severity right after the id, so it reads first in --json", () => {
    const keys = Object.keys(diag("DEK001", { message: "m", path: "p", slug: "s" }));
    expect(keys).toEqual(["id", "severity", "message", "path", "slug"]);
  });

  test("keeps every field it is given", () => {
    expect(
      diag("DEK003", {
        message: "m",
        path: "p",
        line: 3,
        slug: "s",
        hint: "h",
        data: { step: "x" },
      }),
    ).toEqual({
      id: "DEK003",
      severity: "error",
      message: "m",
      path: "p",
      line: 3,
      slug: "s",
      hint: "h",
      data: { step: "x" },
    });
  });
});

describe("errorDiagnostic", () => {
  test("a diagnostic from outside the rule table is an error", () => {
    expect(errorDiagnostic("MD013", { message: "long line" })).toEqual({
      id: "MD013",
      severity: "error",
      message: "long line",
    });
    expect(errorDiagnostic("parse", { message: "bad frontmatter", line: 2 }).severity).toBe(
      "error",
    );
  });
});

describe("hasErrors", () => {
  test("is false for warnings only", () => {
    expect(hasErrors([diag("DEK040", { message: "" })])).toBe(false);
    expect(hasErrors([])).toBe(false);
  });

  test("is true when any diagnostic is an error", () => {
    expect(hasErrors([diag("DEK040", { message: "" }), diag("DEK010", { message: "" })])).toBe(
      true,
    );
  });
});

describe("RULES", () => {
  test("every rule is a DEK id with a severity", () => {
    const ids = Object.keys(RULES) as RuleId[];
    expect(ids.length).toBeGreaterThan(20);
    for (const id of ids) {
      expect(id).toMatch(/^DEK\d{3}$/);
      expect(["error", "warning"]).toContain(RULES[id].severity);
    }
  });
});

describe("uniqueDiagnostics", () => {
  test("keeps one of each, so a project-wide finding is not repeated per deck", () => {
    const a = {
      id: "DEK008",
      severity: "warning" as const,
      message: "m",
      path: "/p/dek.toml",
      line: 2,
    };
    const b = { ...a, path: "/p/decks/x/script.md" };
    expect(uniqueDiagnostics([a, b, { ...a }])).toEqual([a, b]);
  });
});
