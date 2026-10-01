import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runJsonWorker, runPiped, workerCommand } from "../../src/core/spawn.ts";

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

describe("workerCommand", () => {
  test("runs a .ts worker with bun and anything else as is", () => {
    expect(workerCommand("/x/worker.ts")).toEqual(["bun", "--no-install", "/x/worker.ts"]);
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

  test("a worker that prints something else fails as invalid JSON", async () => {
    await expect(
      runJsonWorker(["bun", "-e", "console.log('nope')"], {}, parse, options),
    ).rejects.toMatchObject({ name: "DekError", hint: "worker returned invalid JSON" });
  });
});

describe("runPiped", () => {
  test("writes stdin, closes it, and returns the output and the exit code", async () => {
    const piped = await runPiped(
      [
        "bun",
        "-e",
        "const t = await Bun.stdin.text(); console.log(t.toUpperCase()); console.error('e'); process.exit(3)",
      ],
      { label: "echo failed", hint: "", stdin: "hello", timeoutMs: 10_000 },
    );
    expect(piped).toEqual({ stdout: "HELLO\n", stderr: "e\n", exitCode: 3 });
  });

  test("kills a command that runs past timeoutMs and says so", async () => {
    const started = Date.now();
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
    expect(Date.now() - started).toBeLessThan(3000);
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
