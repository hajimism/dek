import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runJsonWorker, runPiped, workerCommand } from "../../src/core/spawn.ts";
import { withTempDir } from "../helpers/fs.ts";
import { WAIT_MS } from "../helpers/wait.ts";

const helpers = join(import.meta.dir, "..", "helpers");
const parse = (text: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return Array.isArray(parsed.overflows) ? parsed : null;
  } catch {
    return null;
  }
};
const options = { label: "Playwright worker failed", hint: "install it" };

/** Kills the process whose pid a test's shell wrote to `path`, if it got that far. */
async function killRecorded(path: string): Promise<void> {
  const pid = Number((await readFile(path, "utf8").catch(() => "")).trim());
  if (pid > 0) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already gone.
    }
  }
}

describe("workerCommand", () => {
  test("runs a .ts worker with bun and anything else as is", () => {
    expect(workerCommand("/x/worker.ts")).toEqual([
      "bun",
      "--no-install",
      "--no-env-file",
      "--config=/dev/null",
      "/x/worker.ts",
    ]);
    expect(workerCommand("/x/worker")).toEqual(["/x/worker"]);
  });
});

describe("runJsonWorker", () => {
  test("writes the request, waits for the worker, and returns what it parses", async () => {
    const response = await runJsonWorker(
      workerCommand(join(helpers, "fake-playwright.ts")),
      { kind: "pages", viewport: { width: 1, height: 1 }, actions: [], pages: [] },
      parse,
      options,
    );
    expect(response).toEqual({ overflows: [], contrasts: [] });
  });

  test("kills a worker that runs past timeoutMs and says so", async () => {
    await expect(
      runJsonWorker(workerCommand(join(helpers, "fake-playwright-slow.ts")), { pages: [] }, parse, {
        ...options,
        timeoutMs: 20,
      }),
    ).rejects.toMatchObject({
      name: "DekError",
      message: "Playwright worker failed",
      hint: expect.stringContaining("did not finish"),
    });
  });

  test("a worker that exits non-zero fails with its stderr as the hint", async () => {
    await expect(
      runJsonWorker(workerCommand(join(helpers, "fake-playwright-fail.ts")), {}, parse, options),
    ).rejects.toMatchObject({
      name: "DekError",
      hint: expect.stringContaining("intentional playwright worker failure"),
    });
  });

  test(
    "a worker whose output a process it left behind cut short says so, not invalid JSON",
    async () => {
      await withTempDir(async (dir) => {
        const pid = join(dir, "pid");
        try {
          const worker = `printf '{"overflows":'; sleep 30 & echo $! > '${pid}'`;
          await expect(
            runJsonWorker(["sh", "-c", worker], {}, parse, options),
          ).rejects.toMatchObject({ name: "DekError", hint: expect.stringContaining("cut short") });
          expect(existsSync(pid)).toBe(true);
        } finally {
          await killRecorded(pid);
        }
      });
    },
    { timeout: 40_000 },
  );

  test("a worker that prints something else fails as invalid JSON", async () => {
    await expect(
      runJsonWorker(["bun", "-e", "console.log('nope')"], {}, parse, options),
    ).rejects.toMatchObject({ name: "DekError", hint: "worker returned invalid JSON" });
  });
});

describe("runPiped", () => {
  // The preload's default timeout reaches only the first test file, so this one names its own.
  test(
    "writes stdin, closes it, and returns the output and the exit code",
    async () => {
      const piped = await runPiped(
        [
          "bun",
          "-e",
          "const t = await Bun.stdin.text(); console.log(t.toUpperCase()); console.error('e'); process.exit(3)",
        ],
        { label: "echo failed", hint: "", stdin: "hello", timeoutMs: WAIT_MS },
      );
      expect(piped).toEqual({ stdout: "HELLO\n", stderr: "e\n", exitCode: 3 });
    },
    WAIT_MS * 2,
  );

  test("kills a command that runs past timeoutMs and says so", async () => {
    // The fake outlasts the test's timeout, so only killing it settles this in time.
    await expect(
      runPiped(["bun", join(helpers, "fake-ffmpeg-slow.ts")], {
        label: "ffmpeg failed",
        hint: "",
        timeoutMs: 50,
      }),
    ).rejects.toMatchObject({
      name: "DekError",
      message: "ffmpeg failed",
      hint: expect.stringContaining("did not finish"),
    });
  });

  // Each command would hold dek for the 30 s of its sleep; the bound only has to be well short of
  // it. The timeout is well past a shell's start on a busy machine, and the file the shell writes
  // before it proves the SIGTERM came after the trap or the fork, not before.
  test(
    "kills a command that ignores SIGTERM",
    async () => {
      await withTempDir(async (dir) => {
        const ready = join(dir, "ready");
        const started = Date.now();
        try {
          // exec: the shell becomes the sleep, so the SIGKILL ends it and nothing is left behind.
          await expect(
            runPiped(["sh", "-c", `trap '' TERM; echo $$ > '${ready}'; exec sleep 30`], {
              label: "ffmpeg failed",
              hint: "",
              timeoutMs: 4000,
            }),
          ).rejects.toMatchObject({
            name: "DekError",
            hint: expect.stringContaining("did not finish"),
          });
          expect(existsSync(ready)).toBe(true);
          expect(Date.now() - started).toBeLessThan(20_000);
        } finally {
          await killRecorded(ready);
        }
      });
    },
    { timeout: 40_000 },
  );

  test(
    "stops waiting for output a process left behind holds open",
    async () => {
      await withTempDir(async (dir) => {
        const pid = join(dir, "pid");
        const started = Date.now();
        try {
          await expect(
            runPiped(["sh", "-c", `sleep 30 & echo $! > '${pid}'; wait`], {
              label: "ffmpeg failed",
              hint: "",
              timeoutMs: 4000,
            }),
          ).rejects.toMatchObject({
            name: "DekError",
            hint: expect.stringContaining("did not finish"),
          });
          expect(existsSync(pid)).toBe(true);
          expect(Date.now() - started).toBeLessThan(20_000);
        } finally {
          await killRecorded(pid);
        }
      });
    },
    { timeout: 40_000 },
  );

  test(
    "returns once the command exits, whatever it left running",
    async () => {
      await withTempDir(async (dir) => {
        const pid = join(dir, "pid");
        const started = Date.now();
        try {
          const piped = await runPiped(["sh", "-c", `echo done; sleep 30 & echo $! > '${pid}'`], {
            label: "ffmpeg failed",
            hint: "",
            timeoutMs: 60_000,
          });
          expect(piped).toEqual({ stdout: "done\n", stderr: "", exitCode: 0, cutShort: true });
          expect(Date.now() - started).toBeLessThan(20_000);
        } finally {
          await killRecorded(pid);
        }
      });
    },
    { timeout: 40_000 },
  );

  // Bun hands a child the environment the process started with unless told otherwise, and dek
  // starts with what a `.env` set, which it then takes out of process.env.
  test("runs the command with the environment as it is now, not as dek started", async () => {
    const spawnModule = join(import.meta.dir, "..", "..", "src", "core", "spawn.ts");
    const dek = `
      import { runPiped } from ${JSON.stringify(spawnModule)};
      delete process.env.DEK_PROBE;
      process.env.DEK_ADDED = "added";
      const show = "echo \${DEK_PROBE:-unset} \${DEK_ADDED:-unset}";
      const { stdout } = await runPiped(["sh", "-c", show], { label: "x", hint: "", timeoutMs: 10_000 });
      process.stdout.write(stdout);
    `;
    const child = Bun.spawnSync([process.execPath, "-e", dek], {
      env: { ...process.env, DEK_PROBE: "from a .env" },
    });
    expect(child.stdout.toString()).toBe("unset added\n");
  });

  test("a command that cannot start fails with the hint", async () => {
    await expect(
      runPiped(["/no/such/command"], {
        label: "ffmpeg failed",
        hint: "install ffmpeg",
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({ name: "DekError", message: "ffmpeg failed", hint: "install ffmpeg" });
  });
});
