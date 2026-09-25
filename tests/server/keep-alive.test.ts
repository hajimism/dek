import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { onOrphaned, stopOnce } from "../../src/cli/keep-alive.ts";
import { cliPath } from "../helpers/cli.ts";
import { withTempProject } from "../helpers/project.ts";

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function until(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) {
      return true;
    }
    await Bun.sleep(20);
  }
  return check();
}

describe("onOrphaned", () => {
  test("fires once the parent process id changes, and not before", async () => {
    let ppid = 4242;
    let fired = 0;
    const stop = onOrphaned(() => fired++, { ppid: () => ppid, intervalMs: 5 });
    try {
      await Bun.sleep(30);
      expect(fired).toBe(0);
      ppid = 1;
      expect(await until(() => fired === 1, 500)).toBe(true);
      await Bun.sleep(30);
      expect(fired).toBe(1);
    } finally {
      stop();
    }
  });
});

describe("stopOnce", () => {
  test("closes once however many reasons arrive, then exits", async () => {
    let closes = 0;
    const exits: number[] = [];
    const stop = stopOnce(
      async () => {
        closes++;
      },
      (code) => exits.push(code),
    );
    stop();
    stop();
    expect(await until(() => exits.length > 0, 500)).toBe(true);
    expect(closes).toBe(1);
    expect(exits).toEqual([0]);
  });

  test("exits after the grace period when close never finishes", async () => {
    const exits: number[] = [];
    const stop = stopOnce(
      () => new Promise<void>(() => undefined),
      (code) => exits.push(code),
      20,
    );
    stop();
    expect(await until(() => exits.length > 0, 500)).toBe(true);
  });
});

describe("dek dev server lifetime", () => {
  test("exits when the process that started it dies without cleaning up", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      // A parent that starts `dek`, names its pid, and is then SIGKILLed like a timed-out test run.
      const parent = Bun.spawn(
        [
          "bun",
          "-e",
          `const child = Bun.spawn(["bun", ${JSON.stringify(cliPath)}], { cwd: ${JSON.stringify(
            join(root, "decks", "demo"),
          )}, stdout: "inherit", stderr: "ignore" });
console.log("child " + child.pid);
await child.exited;`,
        ],
        { stdout: "pipe", stderr: "ignore" },
      );
      let child = 0;
      try {
        const reader = parent.stdout.getReader();
        const decoder = new TextDecoder();
        let out = "";
        const ready = until(() => /child \d+/.test(out) && /https?:\/\//.test(out), 5000);
        void (async () => {
          for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
            out += decoder.decode(chunk.value, { stream: true });
          }
        })();
        expect(await ready).toBe(true);
        child = Number(out.match(/child (\d+)/)?.[1]);
        parent.kill("SIGKILL");
        await parent.exited;
        expect(await until(() => !isAlive(child), 5000)).toBe(true);
      } finally {
        parent.kill("SIGKILL");
        if (child && isAlive(child)) {
          process.kill(child, "SIGKILL");
        }
      }
    });
  }, 15_000);
});
