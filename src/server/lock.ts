import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { DekError } from "../core/error.ts";
import { readSourceIfExists, writeInside } from "../core/safe-fs.ts";

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

/**
 * The lock's URL in the form the dev server writes it, `http://<loopback>:<port>/`, or nothing
 * for any other. A server.json a repository brings along is its text, and the URL goes into
 * hints and into the requests `dekc goto` sends.
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
    url.port !== "" &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === "" &&
    url.username === "" &&
    url.password === "";
  return served && url.href === value ? url.href : undefined;
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

/** The URL of each root a server in this process holds, which two racing servers both see. */
const claimedRoots = new Map<string, string>();

/** Throw when a live server, in this process or another, already holds `root`. */
export function assertNoDevServer(root: string): void {
  const existing = readDevServerLock(root);
  const running =
    claimedRoots.get(root) ?? (existing && isPidAlive(existing.pid) ? existing.url : undefined);
  if (running !== undefined) {
    throw new DekError(`dev server already running at ${running}`, {
      path: serverLockPath(root),
      hint: `open ${running}`,
    });
  }
}

export function writeDevServerLock(
  root: string,
  url: string,
  password?: string,
  deck?: string,
): void {
  assertNoDevServer(root);
  claimedRoots.set(root, url);
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
    unlinkSync(serverLockPath(root));
  } catch {
    /* already gone */
  }
}
