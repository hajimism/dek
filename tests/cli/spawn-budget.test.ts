import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SPAWN_BUDGET = 32;

describe("cli test spawn budget", () => {
  test("keeps subprocess CLI runs to wiring checks", () => {
    const dir = import.meta.dir;
    let count = 0;
    const perFile: Record<string, number> = {};
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".test.ts") || name === "spawn-budget.test.ts") continue;
      const source = readFileSync(join(dir, name), "utf8");
      const n = (source.match(/\b(runDek|spawnDekServer)\(/g) ?? []).length;
      perFile[name] = n;
      count += n;
    }
    expect({ count, perFile }).toMatchObject({ count: expect.any(Number) });
    expect(count).toBeLessThanOrEqual(SPAWN_BUDGET);
  });
});
