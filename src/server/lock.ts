import { existsSync } from "node:fs";
import { join } from "node:path";
import { DekError } from "../core/error.ts";
import { isDeckName } from "../core/path.ts";
import { readSourceIfExists, removeInside, writeInside } from "../core/safe-fs.ts";

export type DevServerLock = {
  url: string;
  pid: number;
  password?: string;
  /** The one deck a server scoped to a deck serves; absent when it serves the project. */
  deck?: string;
};

function serverLockPath(root: string): string {
  return join(root, ".dek", "server.json");
}

/**
 * Whether a process with this pid runs. Only a positive whole number names one process: 0 and a
 * negative pid signal a whole group, which `kill` reports as alive.
 */
export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** The hosts a dev server's URL in its lock names: it writes this machine's loopback address. */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** The URL a dev server on `port` writes in its lock, as `URL` spells it: port 80 takes none. */
export function devServerUrl(port: number): string {
  return new URL(`http://127.0.0.1:${port}/`).href;
}

/**
 * The lock's URL in the form the dev server writes it, `http://<loopback>:<port>/`, or nothing
 * for any other. A server.json a repository brings along is its text, and the URL goes into
 * hints and into the requests `dekc goto` sends. Port 80 is read with or without `:80`.
 */
function serverUrl(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  const served =
    url.protocol === "http:" &&
    LOOPBACK_HOSTS.has(url.hostname) &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === "" &&
    url.username === "" &&
    url.password === "";
  const written = url.port === "" ? [url.href, `http://${url.hostname}:80/`] : [url.href];
  return served && written.includes(value) ? url.href : undefined;
}

export function readDevServerLock(root: string): DevServerLock | undefined {
  const path = serverLockPath(root);
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(readSourceIfExists(path, root) ?? "") as DevServerLock;
    const url = serverUrl(parsed.url);
    if (url !== undefined && typeof parsed.pid === "number") {
      return {
        url,
        pid: parsed.pid,
        ...(typeof parsed.password === "string" ? { password: parsed.password } : {}),
        ...(typeof parsed.deck === "string" ? { deck: parsed.deck } : {}),
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** The server each root a server in this process holds, which two racing servers both see. */
const claimedRoots = new Map<string, Omit<DevServerLock, "password">>();

/**
 * Throw when a live server, in this process or another, already holds `root`. `deck` is the one
 * deck the server about to start would serve, none for the whole project.
 */
export function assertNoDevServer(root: string, deck?: string): void {
  const existing = readDevServerLock(root);
  const running =
    claimedRoots.get(root) ?? (existing && isPidAlive(existing.pid) ? existing : undefined);
  if (running !== undefined) {
    throw new DekError(`dev server already running at ${running.url}`, {
      path: serverLockPath(root),
      hint: runningServerHint(root, running, deck),
    });
  }
}

/**
 * Where the running server shows what was asked for, or, when it serves one other deck only, how
 * to get one that serves both: `dekc` started inside a deck's folder serves that deck alone.
 */
function runningServerHint(
  root: string,
  running: Omit<DevServerLock, "password">,
  deck: string | undefined,
): string {
  if (running.deck === deck) {
    return `open ${running.url}`;
  }
  if (running.deck === undefined && deck !== undefined) {
    return `open ${running.url}decks/${encodeURIComponent(deck)}/`;
  }
  // The lock is a file a repository could bring along: name only a deck this project has.
  const named =
    running.deck !== undefined &&
    isDeckName(running.deck) &&
    existsSync(join(root, "decks", running.deck, "script.md"))
      ? `decks/${running.deck}`
      : "one deck";
  const wanted = deck === undefined ? "the whole project" : `decks/${deck}`;
  return `it serves only ${named}; to serve ${wanted}, stop it (pid ${running.pid}) and run \`dekc\` at the project root, which serves every deck`;
}

export function writeDevServerLock(
  root: string,
  url: string,
  password?: string,
  deck?: string,
): void {
  assertNoDevServer(root, deck);
  claimedRoots.set(root, { url, pid: process.pid, ...(deck ? { deck } : {}) });
  try {
    // A fresh file renamed into place, so it may hold the --remote password: its owner's only.
    writeInside(
      serverLockPath(root),
      `${JSON.stringify({ url, pid: process.pid, ...(password ? { password } : {}), ...(deck ? { deck } : {}) })}\n`,
      root,
      { mode: 0o600 },
    );
  } catch (error) {
    claimedRoots.delete(root);
    throw error;
  }
}

export function removeDevServerLock(root: string): void {
  claimedRoots.delete(root);
  const current = readDevServerLock(root);
  if (current && current.pid !== process.pid) {
    return;
  }
  try {
    removeInside(serverLockPath(root), root);
  } catch {
    /* a lock left behind names a process that is gone, which the next server sees */
  }
}
