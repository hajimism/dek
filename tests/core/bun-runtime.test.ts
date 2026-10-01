import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "..");
const engine = (
  JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    engines: { bun: string };
  }
).engines.bun;
const floor = engine.replace(/^>=\s*/, "");

describe("the Bun dek runs on", () => {
  test("is one package.json allows", () => {
    expect({ bun: Bun.version, satisfies: Bun.semver.satisfies(Bun.version, engine) }).toEqual({
      bun: Bun.version,
      satisfies: true,
    });
  });

  test("is checked at its oldest in CI and the docs build", () => {
    const ci = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");
    const pages = readFileSync(join(root, ".github", "workflows", "pages.yml"), "utf8");
    expect(engine).toMatch(/^>=\d+\.\d+\.\d+$/);
    expect(ci.match(/^\s*bun: \[([^,\]]+)/m)?.[1]).toBe(floor);
    expect(pages.match(/bun-version: (\S+)/)?.[1]).toBe(floor);
  });

  // Before 1.4.0, node:child_process closed a child's pipes past stdio[2] again when the finished
  // ChildProcess was collected, taking down whatever held the fd numbers by then. Playwright talks
  // to Chromium over stdio[3] and stdio[4], so a browser test closed dev servers' sockets in
  // whichever test ran next: ECONNRESET, ConnectionRefused.
  test("closes a finished child's extra stdio pipe once", async () => {
    const runChild = async (): Promise<void> => {
      const child = spawn("/bin/sh", ["-c", "exit 0"], {
        stdio: ["ignore", "ignore", "ignore", "pipe"],
      });
      await new Promise((resolve) => child.once("close", resolve));
    };
    // The newest child can stay reachable from the stack; the older ones are collected.
    for (let i = 0; i < 5; i++) {
      await runChild();
    }
    const servers = Array.from({ length: 16 }, () =>
      Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("ok") }),
    );
    const ports = servers.map((server) => server.port);
    try {
      for (let i = 0; i < 3; i++) {
        Bun.gc(true);
        await Bun.sleep(30);
      }
      // A server whose socket was closed under it reports port -1.
      expect(servers.map((server) => server.port)).toEqual(ports);
    } finally {
      for (const server of servers) {
        server.stop(true);
      }
    }
  });
});
