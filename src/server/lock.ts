import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DekError } from "../core/error.ts";

export type DevServerLock = {
  url: string;
  pid: number;
  password?: string;
};

export function serverLockPath(root: string): string {
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
    mkdirSync(join(root, ".dek"), { recursive: true });
    writeFileSync(
      serverLockPath(root),
      `${JSON.stringify({ url, pid: process.pid, ...(password ? { password } : {}) })}\n`,
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
