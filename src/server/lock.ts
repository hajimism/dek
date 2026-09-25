import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { DekError } from "../core/error.ts";
import { writeInside } from "../core/safe-fs.ts";

export type DevServerLock = {
  url: string;
  pid: number;
  password?: string;
};

function serverLockPath(root: string): string {
  return join(root, ".dek", "server.json");
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
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

const claimedRoots = new Set<string>();

export function writeDevServerLock(root: string, url: string, password?: string): void {
  const existing = readDevServerLock(root);
  if (claimedRoots.has(root) || (existing && isPidAlive(existing.pid))) {
    const running = existing?.url ?? url;
    throw new DekError(`dev server already running at ${running}`, {
      path: serverLockPath(root),
      hint: `open ${running}`,
    });
  }
  claimedRoots.add(root);
  try {
    // A fresh file renamed into place, so it may hold the --remote password: its owner's only.
    writeInside(
      serverLockPath(root),
      `${JSON.stringify({ url, pid: process.pid, ...(password ? { password } : {}) })}\n`,
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
