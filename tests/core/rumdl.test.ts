import { describe, expect, test } from "bun:test";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultRumdlRunner, resolveRumdlBin, rumdlDiagnostics } from "../../src/core/rumdl.ts";
import { withTempDir } from "../helpers/fs.ts";

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

describe("resolveRumdlBin", () => {
  test("prefers DEK_RUMDL over PATH and local bins", () => {
    const previous = process.env.DEK_RUMDL;
    process.env.DEK_RUMDL = "/tmp/custom-rumdl";
    try {
      expect(resolveRumdlBin()).toBe("/tmp/custom-rumdl");
    } finally {
      if (previous === undefined) {
        delete process.env.DEK_RUMDL;
      } else {
        process.env.DEK_RUMDL = previous;
      }
    }
  });

  test("finds node_modules/.bin/rumdl from cwd when rumdl is not on PATH", async () => {
    await withTempDir(async (dir) => {
      const binDir = join(dir, "node_modules", ".bin");
      await mkdir(binDir, { recursive: true });
      const rumdl = join(binDir, "rumdl");
      await writeFile(rumdl, "#!/bin/sh\necho ok\n");
      await chmod(rumdl, 0o755);
      const nested = join(dir, "decks", "why-dek");
      await mkdir(nested, { recursive: true });
      const previous = process.env.DEK_RUMDL;
      const cwd = process.cwd();
      delete process.env.DEK_RUMDL;
      try {
        process.chdir(nested);
        if (Bun.which("rumdl")) {
          expect(resolveRumdlBin()).toBeTruthy();
        } else {
          expect(resolveRumdlBin()).toBe(rumdl);
        }
      } finally {
        process.chdir(cwd);
        if (previous === undefined) {
          delete process.env.DEK_RUMDL;
        } else {
          process.env.DEK_RUMDL = previous;
        }
      }
    });
  });
});

describe("defaultRumdlRunner", () => {
  test("returns stdout when rumdl writes a megabyte of stderr", async () => {
    const noisy = join(import.meta.dir, "..", "helpers", "fake-noisy.ts");
    await withTempDir(async (dir) => {
      const scriptPath = join(dir, "script.md");
      await writeFile(scriptPath, "# demo\n");
      const previous = process.env.DEK_RUMDL;
      process.env.DEK_RUMDL = noisy;
      try {
        const started = Date.now();
        const stdout = await Promise.race([
          defaultRumdlRunner(scriptPath),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("hung")), 2000);
          }),
        ]);
        expect(Date.now() - started).toBeLessThan(2000);
        expect(stdout).toContain("ok");
      } finally {
        if (previous === undefined) {
          delete process.env.DEK_RUMDL;
        } else {
          process.env.DEK_RUMDL = previous;
        }
      }
    });
  });
});
