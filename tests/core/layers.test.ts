import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const CORE_DIR = join(import.meta.dir, "../../src/core");
const FORBIDDEN = /\bfrom\s+["']\.\.\/(runtime|video|voice)\//;

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTs(path));
    } else if (entry.name.endsWith(".ts")) {
      out.push(path);
    }
  }
  return out;
}

describe("core layer", () => {
  test("does not import runtime, video, or voice adapters", () => {
    const violations: string[] = [];
    for (const file of listTs(CORE_DIR)) {
      const source = readFileSync(file, "utf8");
      if (FORBIDDEN.test(source)) {
        violations.push(relative(CORE_DIR, file));
      }
    }
    expect(violations).toEqual([]);
  });
});
