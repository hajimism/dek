import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { failureReport } from "../../scripts/agent-hooks.ts";
import { importers, importsOf, parseStatus, testsFor } from "../../scripts/related-tests.ts";
import { withTempDir } from "../helpers/fs.ts";
import { repoRoot } from "../helpers/paths.ts";

async function writeTree(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), text);
  }
}

describe("which tests speak for a module", () => {
  test("a relative import counts, resolved from the test file; a package or a type does not", () => {
    const code = [
      'import { a } from "../../src/core/a.ts";',
      'import type { B } from "../../src/core/b.ts";',
      'import { test } from "bun:test";',
      'const c = await import("../helpers/c.ts");',
    ].join("\n");
    expect(importsOf("tests/core/a.test.ts", code)).toEqual([
      "src/core/a.ts",
      "tests/helpers/c.ts",
    ]);
  });

  test("only the test files that import the module themselves", async () => {
    await withTempDir(async (root) => {
      await writeTree(root, {
        "tests/core/a.test.ts": 'import "../../src/core/a.ts";',
        "tests/core/b.test.ts": 'import "../helpers/h.ts";',
        "tests/helpers/h.ts": 'import "../../src/core/a.ts";',
      });
      const byModule = importers(root);
      expect(byModule.get("src/core/a.ts")).toEqual(["tests/core/a.test.ts"]);
      expect(byModule.get("tests/helpers/h.ts")).toEqual(["tests/core/b.test.ts"]);
    });
  });

  test("this repository's own: a module's test file imports it", () => {
    expect(importers(repoRoot).get("src/core/css-scan.ts")).toContain(
      "tests/core/css-scan.test.ts",
    );
  });
});

describe("what a turn's end runs", () => {
  test("git status names each path once, the new one of a rename", () => {
    const output = [" M src/a.ts", "R  src/new.ts", "src/old.ts", "?? tests/b.test.ts", ""].join(
      "\0",
    );
    expect(parseStatus(output)).toEqual(["src/a.ts", "src/new.ts", "tests/b.test.ts"]);
  });

  test("the changed test files and those importing a changed file, if they still exist", async () => {
    await withTempDir(async (root) => {
      await writeTree(root, {
        "tests/a.test.ts": "",
        "tests/b.test.ts": "",
        "tests/c.test.ts": "",
      });
      const byModule = new Map([
        ["src/a.ts", ["tests/a.test.ts", "tests/b.test.ts"]],
        ["tests/helpers/h.ts", ["tests/c.test.ts"]],
      ]);
      const changed = ["src/a.ts", "tests/helpers/h.ts", "tests/b.test.ts", "tests/gone.test.ts"];
      expect(testsFor(root, changed, byModule)).toEqual([
        "tests/a.test.ts",
        "tests/b.test.ts",
        "tests/c.test.ts",
      ]);
      expect(testsFor(root, ["docs/a.md"], byModule)).toEqual([]);
    });
  });

  test("a failure report names each failed test once, without its time or color", () => {
    const output = [
      "tests/a.test.ts:",
      "\x1b[31m(fail)\x1b[0m adds > one [0.20ms]",
      "(fail) adds > one [0.20ms]",
      "(pass) adds > two [1.00ms]",
      "(fail) adds > three [1.20s]",
    ].join("\n");
    const report = failureReport(output, ["tests/a.test.ts"], ["bun", "test", "tests/a.test.ts"]);
    expect(report).toContain("(fail) adds > one\n(fail) adds > three\n");
    expect(report).toContain("Run them again: bun test tests/a.test.ts");
    expect(report).not.toContain("(pass)");
  });

  test("a run that fails before any test does reports how the output ends", () => {
    const report = failureReport(
      "\nSyntaxError: Unexpected token\n\n",
      ["tests/a.test.ts"],
      ["bun"],
    );
    expect(report).toContain("SyntaxError: Unexpected token");
  });
});
