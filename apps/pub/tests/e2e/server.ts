// Starts `vp dev` on a port of its own with a fresh local state, for the end-to-end run, and
// stands in for the browser where a person would click: signing up, and approving a device code.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const APP = join(import.meta.dir, "..", "..");

export type DevServer = { url: string; deckOrigin: (id: string) => string; stop(): Promise<void> };

export async function startDevServer(port: number): Promise<DevServer> {
  const state = mkdtempSync(join(tmpdir(), "dek-pub-e2e-"));
  const url = `http://localhost:${port}`;
  const child = Bun.spawn(["node_modules/.bin/vp", "dev", "--port", String(port), "--strictPort"], {
    cwd: APP,
    env: {
      ...process.env,
      DEK_PUB_STATE: state,
      APP_ORIGIN: url,
      DECK_ORIGIN: `http://d-{id}.localhost:${port}`,
      DEK_PUB_DEV_LOGIN: "1",
      TURNSTILE_SECRET: "off",
      SERVE_TOKEN_SECRET: "e2e-serve-token-secret",
      AUTH_GITHUB_CLIENT_ID: "e2e",
      AUTH_GITHUB_CLIENT_SECRET: "e2e",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const log: string[] = [];
  for (const stream of [child.stdout, child.stderr]) {
    void (async () => {
      for await (const chunk of stream) {
        log.push(new TextDecoder().decode(chunk));
      }
    })();
  }
  const deadline = Date.now() + 120_000;
  while (true) {
    try {
      const response = await fetch(`${url}/api/me`, { signal: AbortSignal.timeout(30_000) });
      if (response.status === 401) {
        break;
      }
    } catch {
      // not listening yet
    }
    if (child.exitCode !== null || Date.now() > deadline) {
      child.kill();
      throw new Error(`the dev server did not start:\n${log.join("").slice(-4000)}`);
    }
    await Bun.sleep(500);
  }
  return {
    url,
    deckOrigin: (id) => `http://d-${id.replace(/^d_/, "")}.localhost:${port}`,
    async stop() {
      // vp runs Vite in a child of its own, which outlives vp when only vp is stopped.
      const tree = descendants(child.pid);
      for (const pid of [child.pid, ...tree]) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          // already gone
        }
      }
      await Promise.race([child.exited, Bun.sleep(5000)]);
      for (const pid of [child.pid, ...tree]) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // already gone
        }
      }
      rmSync(state, { recursive: true, force: true });
    },
  };
}

/** Every process started under `pid`, children first. */
function descendants(pid: number): number[] {
  const found = Bun.spawnSync(["pgrep", "-P", String(pid)])
    .stdout.toString()
    .trim();
  const children = found ? found.split("\n").map(Number) : [];
  return children.flatMap((child) => [...descendants(child), child]);
}

/** A browser session: signs up with the development email form's endpoint and keeps the cookie. */
export class Browser {
  private cookie = "";

  constructor(private readonly base: string) {}

  async signUp(name: string): Promise<{ id: string; handle: string }> {
    const email = `${name.toLowerCase()}-${Date.now()}@example.com`;
    const response = await this.fetch("/api/auth/sign-up/email", {
      method: "POST",
      json: { email, password: "password-1234", name },
    });
    if (!response.ok) {
      throw new Error(`sign-up failed: ${response.status} ${await response.text()}`);
    }
    return ((await response.json()) as { user: { id: string; handle: string } }).user;
  }

  /** What the /device page does: claim the code while signed in, then approve it. */
  async approveDevice(userCode: string): Promise<void> {
    const code = userCode.replace(/-/g, "");
    const claim = await this.fetch(`/api/auth/device?user_code=${encodeURIComponent(code)}`);
    if (!claim.ok) {
      throw new Error(`claiming ${code} failed: ${claim.status} ${await claim.text()}`);
    }
    const approve = await this.fetch("/api/auth/device/approve", {
      method: "POST",
      json: { userCode: code },
    });
    if (!approve.ok) {
      throw new Error(`approving ${code} failed: ${approve.status} ${await approve.text()}`);
    }
  }

  async fetch(path: string, init: { method?: string; json?: unknown } = {}): Promise<Response> {
    const headers = new Headers({ origin: this.base });
    if (this.cookie) {
      headers.set("cookie", this.cookie);
    }
    if (init.json !== undefined) {
      headers.set("content-type", "application/json");
    }
    const response = await fetch(this.base + path, {
      method: init.method ?? "GET",
      headers,
      body: init.json === undefined ? undefined : JSON.stringify(init.json),
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
    const set = response.headers.getSetCookie();
    if (set.length > 0) {
      const jar = new Map(
        this.cookie
          .split("; ")
          .filter(Boolean)
          .map((pair) => [pair.split("=")[0], pair]),
      );
      for (const line of set) {
        const pair = line.split(";")[0] ?? "";
        jar.set(pair.split("=")[0], pair);
      }
      this.cookie = [...jar.values()].join("; ");
    }
    return response;
  }
}
