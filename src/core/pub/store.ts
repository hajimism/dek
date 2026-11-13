// biome-ignore lint/style/noRestrictedImports: mkdirSync, for the folder in the user's config directory dek keeps its dek.pub key in, outside any project for safe-fs to hold it to.
import { mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { DekError } from "../error.ts";
import { shellQuote } from "../escape.ts";
import { readSourceIfExists, removeInside, requireInside, writeInside } from "../safe-fs.ts";
import { DEFAULT_SERVER } from "./client.ts";

/**
 * Where dek keeps what signing in to dek.pub leaves: the API key of each server, and a sign-in
 * that waits for its approval. The key goes to the OS keychain through Bun.secrets, under the
 * service "dek.pub" and the server's origin; where there is no keychain, to a file only its owner
 * may read. DEK_TOKEN, for CI, is a key no store holds. DEK_PUB_CREDENTIALS names the file to keep
 * the key in and leaves the keychain alone, as the tests do (ADR 48).
 */

const SERVICE = "dek.pub";

/** Where a key came from: DEK_TOKEN, the OS keychain, or the credentials file. */
export type KeySource = "env" | "keychain" | "file";

export type Key = { key: string; source: KeySource };

/** The folder dek keeps its own files in: `$XDG_CONFIG_HOME/dek`, else `~/.config/dek`. */
function configDir(env: NodeJS.ProcessEnv): string {
  const base = env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config");
  return join(base, "dek");
}

function credentialsPath(env: NodeJS.ProcessEnv): string {
  return env.DEK_PUB_CREDENTIALS?.trim() || join(configDir(env), "credentials.json");
}

/** Whether the keychain may hold the key: not when DEK_PUB_CREDENTIALS names a file for it. */
function keychainAllowed(env: NodeJS.ProcessEnv): boolean {
  return !env.DEK_PUB_CREDENTIALS?.trim() && typeof Bun.secrets?.get === "function";
}

/** The key dek sends to `origin`: DEK_TOKEN's when it is for that server, else the one login kept. */
export async function readKey(
  origin: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Key | undefined> {
  const token = tokenFor(origin, env);
  return token ? { key: token, source: "env" } : readStoredKey(origin, env);
}

/**
 * DEK_TOKEN, when it is meant for `origin`: dek.pub's, unless DEK_TOKEN_SERVER names the server
 * it is for. A token set for one server never goes to another that --server names.
 */
export function tokenFor(origin: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const token = env.DEK_TOKEN?.trim();
  if (!token) {
    return undefined;
  }
  const named = env.DEK_TOKEN_SERVER?.trim();
  let server = DEFAULT_SERVER;
  if (named) {
    try {
      server = new URL(named).origin;
    } catch {
      throw new DekError(`invalid DEK_TOKEN_SERVER "${named}"`, {
        hint: `name the server DEK_TOKEN is for by its address, like ${DEFAULT_SERVER}`,
      });
    }
  }
  return server === origin ? token : undefined;
}

/** The key login kept for `origin`: the keychain's, else the file's. */
export async function readStoredKey(
  origin: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Key | undefined> {
  if (keychainAllowed(env)) {
    const key = await keychain(() => Bun.secrets.get({ service: SERVICE, name: origin }));
    if (typeof key === "string" && key !== "") {
      return { key, source: "keychain" };
    }
  }
  const key = readKeys(env)[origin];
  return key === undefined ? undefined : { key, source: "file" };
}

/** Keep `key` for `origin`, in the keychain where there is one, else in the file. */
export async function storeKey(
  origin: string,
  key: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Exclude<KeySource, "env">> {
  if (keychainAllowed(env)) {
    const stored = await keychain(async () => {
      await Bun.secrets.set({ service: SERVICE, name: origin, value: key });
      return true;
    });
    if (stored === true) {
      // One place holds it: a key left in the file from a run with no keychain is the old one.
      writeKeys(env, { ...readKeys(env), [origin]: undefined });
      return "keychain";
    }
  }
  writeKeys(env, { ...readKeys(env), [origin]: key });
  return "file";
}

/** Forget the key of `origin` wherever dek kept it; whether there was one. */
export async function forgetKey(
  origin: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const fromKeychain = keychainAllowed(env)
    ? (await keychain(() => Bun.secrets.delete({ service: SERVICE, name: origin }))) === true
    : false;
  const keys = readKeys(env);
  const fromFile = keys[origin] !== undefined;
  if (fromFile) {
    writeKeys(env, { ...keys, [origin]: undefined });
  }
  return fromKeychain || fromFile;
}

/** A keychain call, or undefined when there is no keychain to answer it, as on a bare Linux. */
async function keychain<T>(call: () => Promise<T>): Promise<T | undefined> {
  try {
    return await call();
  } catch {
    return undefined;
  }
}

const KeysFile = z.object({
  version: z.literal(1),
  keys: z.record(z.string(), z.string()),
});

function readKeys(env: NodeJS.ProcessEnv): Record<string, string> {
  return readJson(credentialsPath(env), KeysFile)?.keys ?? {};
}

function writeKeys(env: NodeJS.ProcessEnv, keys: Record<string, string | undefined>): void {
  const kept = Object.fromEntries(
    Object.entries(keys).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  writeJson(
    credentialsPath(env),
    Object.keys(kept).length > 0 ? { version: 1, keys: kept } : undefined,
  );
}

/** A sign-in waiting for its approval in the browser: what the device flow gave the CLI. */
export const PendingLogin = z.strictObject({
  deviceCode: z.string(),
  userCode: z.string(),
  url: z.string(),
  /** Seconds to wait between polls. */
  interval: z.number(),
  expiresAt: z.string(),
});
export type PendingLogin = z.infer<typeof PendingLogin>;

const LoginsFile = z.object({
  version: z.literal(1),
  logins: z.record(z.string(), PendingLogin),
});

/** Beside the credentials, since it is one too, for as long as the code lives. */
function loginsPath(env: NodeJS.ProcessEnv): string {
  return join(dirname(credentialsPath(env)), "login.json");
}

export function readPendingLogin(
  origin: string,
  env: NodeJS.ProcessEnv = process.env,
): PendingLogin | undefined {
  return readJson(loginsPath(env), LoginsFile)?.logins[origin];
}

export function writePendingLogin(
  origin: string,
  login: PendingLogin | undefined,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const logins = { ...readJson(loginsPath(env), LoginsFile)?.logins };
  if (login === undefined) {
    delete logins[origin];
  } else {
    logins[origin] = login;
  }
  writeJson(loginsPath(env), Object.keys(logins).length > 0 ? { version: 1, logins } : undefined);
}

/** A file of dek's, or nothing when it is missing; one that does not read is said to. */
function readJson<S extends z.ZodType>(path: string, schema: S): z.infer<S> | undefined {
  const dir = dirname(path);
  let text: string | undefined;
  try {
    text = readSourceIfExists(path, dir);
  } catch (error) {
    if (error instanceof DekError) {
      throw error;
    }
    return undefined;
  }
  if (text === undefined) {
    return undefined;
  }
  refuseShared(path, dir);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    value = undefined;
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new DekError(`${path} does not read`, {
      path,
      hint: "delete it and run `dekc pub login` again",
    });
  }
  return parsed.data;
}

/**
 * A file of credentials is read only when it is the user's own and no one else may read or write
 * it: one another account owns, or one open to the group or to others, may hold a key someone
 * else put there, or one someone else has read.
 */
function refuseShared(path: string, dir: string): void {
  const stat = statSync(requireInside(path, dir));
  const uid = process.getuid?.();
  if (uid !== undefined && stat.uid !== uid) {
    throw new DekError(`${path} belongs to another account`, {
      path,
      hint: `delete it and run \`dekc pub login\` again`,
    });
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new DekError(`${path} may be read or written by others`, {
      path,
      hint: `run \`chmod 600 ${shellQuote(path)}\`, or delete it and run \`dekc pub login\` again`,
    });
  }
}

/** Write `value` as the file at `path`, readable by its owner alone, or remove it when undefined. */
function writeJson(path: string, value: object | undefined): void {
  const dir = dirname(path);
  if (value === undefined) {
    try {
      removeInside(path, dir);
    } catch {
      // A folder that is not there holds no file to remove.
    }
    return;
  }
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeInside(path, `${JSON.stringify(value, null, 2)}\n`, dir, { mode: 0o600 });
}
