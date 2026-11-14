// Starts `vp dev` on a port of its own with a fresh local state, for the end-to-end run, and
// stands in for the browser where a person would click: signing up, and approving a device code.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import appConfig from "../../void.config.ts";

const APP = join(import.meta.dir, "..", "..");
// Miniflare names the local bucket as void.config.ts does.
const [{ bucket_name: BUCKET }] = appConfig.cloudflare.r2_buckets;

export type DevServer = {
  url: string;
  deckOrigin: (id: string) => string;
  /** Miniflare's own view of the app's storage, to set up or see what no API reaches. */
  store: Store;
  stop(): Promise<void>;
};

/** The D1 database and R2 bucket under the dev server, through Miniflare's local explorer. */
export type Store = {
  sql(query: string, params?: unknown[]): Promise<unknown[][]>;
  keys(prefix: string): Promise<string[]>;
  put(key: string, body: string): Promise<void>;
};

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
    store: explorer(`${url}/cdn-cgi/local/explorer/api`),
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

function explorer(api: string): Store {
  const call = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${api}${path}`, init);
    const body = (await response.json()) as { success: boolean; result: unknown };
    if (!body.success) {
      throw new Error(`${path} answered ${response.status}: ${JSON.stringify(body)}`);
    }
    return body.result;
  };
  return {
    async sql(query, params = []) {
      const [result] = (await call("/d1/database/local/raw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sql: query, params }),
      })) as Array<{ results: { rows: unknown[][] } }>;
      return result?.results.rows ?? [];
    },
    async keys(prefix) {
      const objects = (await call(
        `/r2/buckets/${BUCKET}/objects?prefix=${encodeURIComponent(prefix)}`,
      )) as Array<{ key: string }>;
      return objects.map((object) => object.key);
    },
    async put(key, body) {
      await call(`/r2/buckets/${BUCKET}/objects/${encodeURIComponent(key)}`, {
        method: "PUT",
        body,
      });
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

/**
 * A browser session: signs up with the development email form's endpoint, chooses a handle as
 * /welcome does, and keeps the cookie. It asks for every page as a browser opens one.
 */
export class Browser {
  private cookie = "";

  constructor(private readonly base: string) {}

  /** Sign up, and choose the name in lowercase as the handle. */
  async signUp(name: string): Promise<{ id: string; handle: string; email: string }> {
    const { id, email } = await this.register(name);
    const chosen = await this.chooseHandle(name.toLowerCase());
    if (!chosen.ok) {
      throw new Error(`choosing a handle failed: ${chosen.status} ${await chosen.text()}`);
    }
    const { handle } = (await chosen.json()) as { handle: string };
    return { id, handle, email };
  }

  /** Sign up, and choose no handle yet. */
  async register(name: string): Promise<{ id: string; email: string }> {
    const email = `${name.toLowerCase()}-${Date.now()}@example.com`;
    const response = await this.fetch("/api/auth/sign-up/email", {
      method: "POST",
      json: { email, password: "password-1234", name },
    });
    if (!response.ok) {
      throw new Error(`sign-up failed: ${response.status} ${await response.text()}`);
    }
    return ((await response.json()) as { user: { id: string; email: string } }).user;
  }

  /** What /welcome does to save the handle chosen. */
  chooseHandle(handle: string): Promise<Response> {
    return this.fetch("/api/me/handle", { method: "PUT", json: { handle } });
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
    const headers = new Headers({ origin: this.base, accept: "text/html,*/*" });
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

export type Mail = { id: string; to: string; subject: string; text: string };

/**
 * The mail the dev server has kept instead of sending, read from Void's inbox pages with the
 * token `vp dev` writes into `.void/`.
 */
export class Inbox {
  private readonly token = readFileSync(join(APP, ".void", "dev-trigger-token"), "utf8").trim();

  constructor(private readonly base: string) {}

  /** Every mail to `to`, oldest first. */
  async to(to: string): Promise<Mail[]> {
    const response = await fetch(`${this.base}/__void/inbox/`, {
      headers: { "x-void-dev-trigger": this.token },
    });
    const html = await response.text();
    const rows = [
      ...html.matchAll(
        /<tr>\s*<td><a href="[^"]*\/__void\/inbox\/([^/?"]+)[^"]*">([^<]*)<\/a><\/td>\s*<td>[^<]*<\/td>\s*<td>([^<]*)<\/td>/g,
      ),
    ].map((match) => ({
      id: match[1] ?? "",
      subject: unescapeHtml(match[2] ?? ""),
      to: unescapeHtml(match[3] ?? ""),
    }));
    const mine = rows.filter((row) => row.to.includes(to)).reverse();
    return Promise.all(mine.map(async (row) => ({ ...row, text: await this.text(row.id) })));
  }

  /** Wait until `to` has at least `count` mails whose subject has `subject` in it, and answer them. */
  async waitFor(to: string, subject: string, count = 1): Promise<Mail[]> {
    const deadline = Date.now() + 15_000;
    while (true) {
      const found = (await this.to(to)).filter((mail) => mail.subject.includes(subject));
      if (found.length >= count || Date.now() > deadline) {
        return found;
      }
      await Bun.sleep(250);
    }
  }

  /** The plain text of one mail, from its MIME source. */
  private async text(id: string): Promise<string> {
    const raw = await (
      await fetch(`${this.base}/__void/inbox/${id}/raw`, {
        headers: { "x-void-dev-trigger": this.token },
      })
    ).text();
    const part =
      raw.split(/\r?\n--/).find((each) => /content-type:\s*text\/plain/i.test(each)) ?? raw;
    const [head = "", ...rest] = part.split(/\r?\n\r?\n/);
    const body = rest.join("\n\n").replace(/\r?\n--[^\n]*--\s*$/, "");
    if (/content-transfer-encoding:\s*base64/i.test(head)) {
      return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
    }
    if (/content-transfer-encoding:\s*quoted-printable/i.test(head)) {
      const bytes = body
        .replace(/=\r?\n/g, "")
        .replace(/=([0-9A-F]{2})/gi, (_, hex: string) =>
          String.fromCharCode(Number.parseInt(hex, 16)),
        );
      return Buffer.from(bytes, "latin1").toString("utf8");
    }
    return body;
  }
}

function unescapeHtml(html: string): string {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}
