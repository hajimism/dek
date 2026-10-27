import { describe, expect, test } from "bun:test";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  defaultRumdlRunner,
  resolveRumdlBin,
  rumdlDiagnostics,
  runRumdl,
} from "../../src/core/rumdl.ts";
import { withEnv } from "../helpers/env.ts";
import { withTempDir } from "../helpers/fs.ts";
import { WAIT_MS } from "../helpers/wait.ts";

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
    expect(await rumdlDiagnostics("script.md", async () => ({}))).toEqual([]);
  });

  test("returns an empty list for invalid JSON", async () => {
    expect(await rumdlDiagnostics("script.md", async () => "not json")).toEqual([]);
  });
});

describe("runRumdl", () => {
  // Lint would pass a script rumdl never checked; it says it skipped rumdl instead.
  test("skips rumdl when what it printed is not SARIF, saying so", async () => {
    for (const text of ["not json", "", '{"version":"2.1.0"}']) {
      expect(await runRumdl("script.md", async () => text)).toEqual({
        diagnostics: [],
        skipped: { reason: "rumdl printed something other than SARIF" },
      });
    }
  });

  test.serial(
    "skips rumdl when a process it left behind cut its output short",
    async () => {
      await withTempDir(async (dir) => {
        const scriptPath = join(dir, "script.md");
        await writeFile(scriptPath, "# demo\n");
        const pid = join(dir, "pid");
        const rumdl = join(dir, "rumdl");
        await writeFile(rumdl, `#!/bin/sh\nprintf '{"runs":'\nsleep 30 & echo $! > '${pid}'\n`);
        await chmod(rumdl, 0o755);
        try {
          await withEnv({ DEK_RUMDL: rumdl }, async () => {
            expect(await runRumdl(scriptPath)).toEqual({
              diagnostics: [],
              skipped: { reason: expect.stringContaining("cut short") },
            });
          });
        } finally {
          const left = Number((await readFile(pid, "utf8").catch(() => "")).trim());
          if (left > 0) {
            process.kill(left, "SIGKILL");
          }
        }
      });
    },
    { timeout: 40_000 },
  );
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
          expect(Bun.which("rumdl", { PATH: emptyPath })).toBeNull();
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
            setTimeout(() => reject(new Error("hung")), WAIT_MS);
          }),
        ]);
        expect(stdout).toContain("ok");
      });
    });
  });

  test.serial("stops a rumdl that hangs and skips it, saying why", async () => {
    const slow = join(import.meta.dir, "..", "helpers", "fake-rumdl-slow.ts");
    await withTempDir(async (dir) => {
      const scriptPath = join(dir, "script.md");
      await writeFile(scriptPath, "# demo\n");
      await withEnv({ DEK_RUMDL: slow }, async () => {
        const started = Date.now();
        const run = (path: string) => defaultRumdlRunner(path, { timeoutMs: 300 });
        expect(await runRumdl(scriptPath, run)).toEqual({
          diagnostics: [],
          skipped: { reason: "rumdl did not finish within 0.3s and was stopped", hung: true },
        });
        // The fake sleeps for 30 s; the bound only has to be well short of it.
        expect(Date.now() - started).toBeLessThan(15_000);
      });
    });
  });

  test.serial("runs rumdl with the environment as it is now", async () => {
    const fake = join(import.meta.dir, "..", "helpers", "fake-rumdl.ts");
    await chmod(fake, 0o755);
    await withTempDir(async (dir) => {
      const scriptPath = join(dir, "script.md");
      await writeFile(scriptPath, "# demo\n");
      await withEnv(
        { DEK_RUMDL: fake, RUMDL_SARIF: "set after start", RUMDL_EXIT: "0" },
        async () => {
          expect(await defaultRumdlRunner(scriptPath)).toBe("set after start\n");
        },
      );
    });
  });
});
