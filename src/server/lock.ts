import { existsSync } from "node:fs";
import { join } from "node:path";
import { DekError } from "../core/error.ts";
import { isDeckName } from "../core/path.ts";
import { createInside, outputPath, readSourceIfExists, removeInside } from "../core/safe-fs.ts";

export type DevServerLock = {
  url: string;
  pid: number;
  password?: string;
  /** The one deck a server started for a deck serves; absent when it serves the project. */
  deck?: string;
};

/**
 * What a server serves: one deck alone, or the project, whose decks are each named. A deck has
 * one server at most, so a server for the project holds every deck in it.
 */
export type ServerScope = { deck: string } | { decks: readonly string[] };

/** Where the locks of servers started for one deck each are kept, apart from the project's. */
function deckLocksDir(root: string): string {
  return join(root, ".dek", "servers");
}

/**
 * Where a server keeps its lock: `.dek/server.json` when it serves the project, and
 * `.dek/servers/<deck>.json` when it serves `deck` alone.
 */
function lockPath(root: string, deck?: string): string {
  return deck === undefined
    ? join(root, ".dek", "server.json")
    : join(deckLocksDir(root), `${deck}.json`);
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

/**
 * The lock at `path`, as the server that holds it wrote it, or nothing: no file, one that does not
 * read, or one that names no dev server of this machine.
 */
function readLockFile(path: string, root: string): DevServerLock | undefined {
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

/**
 * The lock of the server for `deck`, or of the one for the project when no deck is named. A
 * deck's lock is named for its deck, whatever it holds. The project's names a deck only when a
 * dek older than the locks under `.dek/servers/` wrote it, for a server started for that deck.
 */
export function readDevServerLock(root: string, deck?: string): DevServerLock | undefined {
  const lock = readLockFile(lockPath(root, deck), root);
  return lock && deck !== undefined ? { ...lock, deck } : lock;
}

/** A server that runs, and the lock that says so. */
type Running = Omit<DevServerLock, "password"> & { path: string };

function live(lock: DevServerLock | undefined, path: string): Running | undefined {
  if (!lock || !isPidAlive(lock.pid)) {
    return undefined;
  }
  const { password: _password, ...running } = lock;
  return { ...running, path };
}

/** The key of a server for the project among the servers this process holds. */
const PROJECT = Symbol("project");

/** The servers this process holds, by root and by what each serves, which two that race both see. */
const claimed = new Map<string, Map<string | typeof PROJECT, Running>>();

/** The live server whose lock is the project's, or `deck`'s: in this process or another. */
function serverAt(root: string, deck?: string): Running | undefined {
  return (
    claimed.get(root)?.get(deck ?? PROJECT) ??
    live(readDevServerLock(root, deck), lockPath(root, deck))
  );
}

/** Whether `server` shows `deck`: one for the project shows every deck, any other its own. */
function serves(server: Running, deck: string): boolean {
  return server.deck === undefined || server.deck === deck;
}

/**
 * The live servers that serve a deck `scope` names: for one deck, its own server or the one for
 * the project; for the project, the one for the project first, then each deck's.
 */
function serversHolding(root: string, scope: ServerScope): Running[] {
  const project = serverAt(root);
  if ("deck" in scope) {
    const { deck } = scope;
    return [serverAt(root, deck), project && serves(project, deck) ? project : undefined].filter(
      (server) => server !== undefined,
    );
  }
  const held = [...(claimed.get(root)?.keys() ?? [])].filter((key) => typeof key === "string");
  const decks = [...new Set([...scope.decks, ...held])];
  return [project, ...decks.map((deck) => serverAt(root, deck))].filter(
    (server) => server !== undefined,
  );
}

/**
 * The live server that serves `deck`, with what its lock holds: the one started for that deck,
 * else the one for the project. Nothing when no server shows the deck.
 */
export function devServerFor(
  root: string,
  deck: string,
): (DevServerLock & { path: string }) | undefined {
  for (const at of [deck, undefined]) {
    const lock = readDevServerLock(root, at);
    const path = lockPath(root, at);
    const running = live(lock, path);
    if (lock && running && serves(running, deck)) {
      return { ...lock, path };
    }
  }
  return undefined;
}

/**
 * Throw when a live server, in this process or another, already serves a deck that the server
 * about to start for `scope` would serve.
 */
export function assertNoDevServer(root: string, scope: ServerScope): void {
  const running = serversHolding(root, scope);
  if (running.length > 0) {
    throw alreadyRunning(root, running, scope);
  }
}

function alreadyRunning(root: string, running: Running[], scope: ServerScope): DekError {
  const [first] = running as [Running, ...Running[]];
  return new DekError(`dev server already running at ${first.url}`, {
    path: first.path,
    hint: runningServerHint(root, running, scope),
  });
}

/**
 * Where the running server shows what was asked for, or, when the project was asked for and
 * servers for single decks run, how to add a deck beside them and how to get one server for all.
 */
function runningServerHint(root: string, running: Running[], scope: ServerScope): string {
  const [first] = running as [Running, ...Running[]];
  if ("deck" in scope) {
    return first.deck === undefined
      ? `open ${first.url}decks/${encodeURIComponent(scope.deck)}/`
      : `open ${first.url}`;
  }
  if (first.deck === undefined) {
    return `open ${first.url}`;
  }
  const beside = "run `dekc` inside another deck's folder to serve that deck beside";
  const atRoot = "run `dekc` at the project root, which serves every deck";
  if (running.length === 1) {
    return `it serves only ${named(root, first)}; ${beside} it, or stop it (pid ${first.pid}) and ${atRoot}`;
  }
  const each = running.map(
    (server) => `${named(root, server)} at ${server.url} (pid ${server.pid})`,
  );
  return `${running.length} servers serve one deck each: ${each.join(", ")}; ${beside} them, or stop them and ${atRoot}`;
}

/** The deck a server serves, as a hint names it. */
function named(root: string, server: Running): string {
  // A lock is a file a repository could bring along: name only a deck this project has.
  return server.deck !== undefined &&
    isDeckName(server.deck) &&
    existsSync(join(root, "decks", server.deck, "script.md"))
    ? `decks/${server.deck}`
    : "one deck";
}

/**
 * Take the lock for a server at `server.url` that serves `scope`, or throw as `assertNoDevServer`
 * does. Of two servers that race for the same lock, the file goes to one.
 */
export function writeDevServerLock(
  root: string,
  scope: ServerScope,
  server: { url: string; password?: string },
): void {
  assertNoDevServer(root, scope);
  const deck = "deck" in scope ? scope.deck : undefined;
  const path = lockPath(root, deck);
  const claims = claimed.get(root) ?? new Map<string | typeof PROJECT, Running>();
  claimed.set(root, claims);
  claims.set(deck ?? PROJECT, {
    url: server.url,
    pid: process.pid,
    ...(deck !== undefined ? { deck } : {}),
    path,
  });
  try {
    createLock(root, path, scope, server);
    // A server for the project and one for a deck keep different files, so two that started at
    // once each passed the check above. Each sees the other's lock now, and gives way.
    const others = serversHolding(root, scope).filter(
      (other) => other.pid !== process.pid || other.url !== server.url,
    );
    if (others.length > 0) {
      removeInside(path, root);
      throw alreadyRunning(root, others, scope);
    }
  } catch (error) {
    unclaim(root, deck);
    throw error;
  }
}

/** Git ignores a folder that holds this, itself included, whatever the project's .gitignore says. */
const IGNORE_ALL = "*\n";

function createLock(
  root: string,
  path: string,
  scope: ServerScope,
  server: { url: string; password?: string },
): void {
  // Makes the folders, and refuses a lock a repository linked to a file elsewhere.
  outputPath(path, root);
  if ("deck" in scope) {
    // A project made before dek kept these locks does not ignore them, and one may hold a password.
    createInside(join(deckLocksDir(root), ".gitignore"), IGNORE_ALL, root);
  }
  const { url, password } = server;
  const text = `${JSON.stringify({ url, pid: process.pid, ...(password ? { password } : {}) })}\n`;
  // The file may hold the --remote password: its owner's only.
  const create = (): boolean => createInside(path, text, root, { mode: 0o600 });
  if (create()) {
    return;
  }
  // Something is there. The check before this found no live server in it: a lock its server left
  // behind, or a file that does not read. Unless a server took the lock since, it goes.
  const taken = (): DekError | undefined => {
    const holder = live(readLockFile(path, root), path);
    return holder && alreadyRunning(root, [holder], scope);
  };
  const before = taken();
  if (before) {
    throw before;
  }
  removeInside(path, root);
  if (!create()) {
    throw taken() ?? new DekError(`could not take the dev server's lock`, { path });
  }
}

function unclaim(root: string, deck?: string): void {
  const claims = claimed.get(root);
  claims?.delete(deck ?? PROJECT);
  if (claims?.size === 0) {
    claimed.delete(root);
  }
}

/** Give up the lock of this process's server for `deck`, or for the project when none is named. */
export function removeDevServerLock(root: string, deck?: string): void {
  unclaim(root, deck);
  const path = lockPath(root, deck);
  const current = readLockFile(path, root);
  if (current && current.pid !== process.pid) {
    return;
  }
  try {
    removeInside(path, root);
  } catch {
    /* a lock left behind names a process that is gone, which the next server sees */
  }
}
