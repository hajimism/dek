import { describe, expect, test } from "bun:test";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultRumdlRunner, resolveRumdlBin, rumdlDiagnostics } from "../../src/core/rumdl.ts";
import { withEnv } from "../helpers/env.ts";
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
      { id: "MD013", severity: "error", message: "line too long", path: "script.md", line: 8 },
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
  test.serial("prefers DEK_RUMDL over PATH and local bins", async () => {
    await withEnv({ DEK_RUMDL: "/tmp/custom-rumdl" }, async () => {
      expect(resolveRumdlBin()).toBe("/tmp/custom-rumdl");
    });
  });

  test.serial("never runs a node_modules/.bin/rumdl that the working directory holds", async () => {
    await withTempDir(async (dir) => {
      const binDir = join(dir, "node_modules", ".bin");
      await mkdir(binDir, { recursive: true });
      const rumdl = join(binDir, "rumdl");
      await writeFile(rumdl, "#!/bin/sh\necho ok\n");
      await chmod(rumdl, 0o755);
      const nested = join(dir, "decks", "why-dek");
      await mkdir(nested, { recursive: true });
      // An empty PATH entry keeps Bun.which from finding a machine-wide rumdl. A repository
      // someone else wrote can commit node_modules/.bin; dek looks only beside its own install.
      const emptyPath = join(dir, "empty-path");
      await mkdir(emptyPath, { recursive: true });
      const cwd = process.cwd();
      await withEnv({ DEK_RUMDL: undefined, PATH: emptyPath }, async () => {
        try {
          process.chdir(nested);
          expect(Bun.which("rumdl")).toBeNull();
          expect(resolveRumdlBin()).not.toBe(rumdl);
        } finally {
          process.chdir(cwd);
        }
      });
    });
  });
});

describe("defaultRumdlRunner", () => {
  test.serial("returns stdout when rumdl writes a megabyte of stderr", async () => {
    const noisy = join(import.meta.dir, "..", "helpers", "fake-noisy.ts");
    await withTempDir(async (dir) => {
      const scriptPath = join(dir, "script.md");
      await writeFile(scriptPath, "# demo\n");
      await withEnv({ DEK_RUMDL: noisy }, async () => {
        // A full stderr pipe would hang for good; the bound only has to beat the test timeout.
        const stdout = await Promise.race([
          defaultRumdlRunner(scriptPath),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("hung")), 4000);
          }),
        ]);
        expect(stdout).toContain("ok");
      });
    });
  });
});
