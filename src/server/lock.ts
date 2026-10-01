import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { DekcError } from "../core/error.ts";
import { writeInside } from "../core/safe-fs.ts";

export type DevServerLock = {
  url: string;
  pid: number;
  password?: string;
  /** The one deck a server scoped to a deck serves; absent when it serves the project. */
  deck?: string;
};

function serverLockPath(root: string): string {
  return join(root, ".dekc", "server.json");
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readDevServerLock(root: string): DevServerLock | undefined {
  const path = serverLockPath(root);
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as DevServerLock;
    if (typeof parsed.url === "string" && typeof parsed.pid === "number") {
      return {
        url: parsed.url,
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
    throw new DekcError(`dev server already running at ${running}`, {
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
