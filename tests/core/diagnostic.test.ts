import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { diag, errorDiagnostic, hasErrors, RULES, type RuleId } from "../../src/core/diagnostic.ts";

describe("diag", () => {
  test("voice and timing rules, and input dekc ignores or reads another way, are warnings", () => {
    for (const id of [
      "DEKC008",
      "DEKC040",
      "DEKC041",
      "DEKC042",
      "DEKC043",
      "DEKC044",
      "DEKC045",
    ] as const) {
      expect(diag(id, { message: "" }).severity).toBe("warning");
    }
  });

  test("every other dekc rule is an error", () => {
    for (const id of ["DEKC001", "DEKC009", "DEKC010", "DEKC016", "DEKC019", "DEKC030"] as const) {
      expect(diag(id, { message: "" }).severity).toBe("error");
    }
  });

  test("puts severity right after the id, so it reads first in --json", () => {
    const keys = Object.keys(diag("DEKC001", { message: "m", path: "p", slug: "s" }));
    expect(keys).toEqual(["id", "severity", "message", "path", "slug"]);
  });

  test("keeps every field it is given", () => {
    expect(
      diag("DEKC003", {
        message: "m",
        path: "p",
        line: 3,
        slug: "s",
        hint: "h",
        data: { step: "x" },
      }),
    ).toEqual({
      id: "DEKC003",
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
    expect(hasErrors([diag("DEKC040", { message: "" })])).toBe(false);
    expect(hasErrors([])).toBe(false);
  });

  test("is true when any diagnostic is an error", () => {
    expect(hasErrors([diag("DEKC040", { message: "" }), diag("DEKC010", { message: "" })])).toBe(
      true,
    );
  });
});

describe("RULES", () => {
  test("every rule is a DEKC id with a severity and at least one scope", () => {
    const ids = Object.keys(RULES) as RuleId[];
    expect(ids.length).toBeGreaterThan(20);
    for (const id of ids) {
      expect(id).toMatch(/^DEKC\d{3}$/);
      expect(["error", "warning"]).toContain(RULES[id].severity);
      expect(RULES[id].scopes.length).toBeGreaterThan(0);
      for (const scope of RULES[id].scopes) {
        expect(["project", "deck", "slide"]).toContain(scope);
      }
    }
  });
});

describe("the rule table", () => {
  const root = join(import.meta.dir, "..", "..");
  const source = readdirSync(join(root, "src"), { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts") && !file.endsWith("diagnostic.ts"))
    .map((file) => readFileSync(join(root, "src", file), "utf8"))
    .join("\n");

  test("every rule is emitted somewhere in src", () => {
    const silent = Object.keys(RULES).filter((id) => !source.includes(`diag("${id}"`));
    expect(silent).toEqual([]);
  });

  test("every rule has a row in the lint reference, in English and in Japanese", () => {
    for (const docs of [["docs"], ["docs", "ja"]]) {
      const reference = readFileSync(join(root, ...docs, "reference", "lint.md"), "utf8");
      const rows = new Set([...reference.matchAll(/^\| `(DEKC\d{3})` \|/gm)].map((m) => m[1]));
      expect(Object.keys(RULES).filter((id) => !rows.has(id))).toEqual([]);
      expect([...rows].filter((id) => !(id && id in RULES))).toEqual([]);
    }
  });

  test("the lint reference gives each rule the scopes the table does, in both languages", () => {
    for (const docs of [["docs"], ["docs", "ja"]]) {
      const reference = readFileSync(join(root, ...docs, "reference", "lint.md"), "utf8");
      const documented = Object.fromEntries(
        [...reference.matchAll(/^\| `(DEKC\d{3})` \| ([^|]+) \|/gm)].map((m) => [
          m[1],
          [...(m[2] ?? "").matchAll(/`(\w+)`/g)].map((scope) => scope[1]),
        ]),
      );
      const table = Object.fromEntries(
        Object.entries(RULES).map(([id, rule]) => [id, [...rule.scopes]]),
      );
      expect(documented).toEqual(table);
    }
  });
});
