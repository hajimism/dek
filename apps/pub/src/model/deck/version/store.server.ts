// Versions in D1 and their files in R2. The deck row counts the numbers publishes take, so a
// version's files are written under a number no other upload has, and the version is recorded
// together with what it changes on the deck only while the deck is still on the version it was
// made on. Once it is, every version below it goes.

import { decks, renames, versions } from "@schema";
import { and, asc, db, eq, isNull, lt, sql } from "void/db";
import { storage } from "void/storage";
import type { Rename, VersionManifest } from "../../../../../../src/pub/protocol.ts";
import { ApiError } from "../../../common/api-error.ts";
import { now } from "../../../common/db.server.ts";
import { versionKey, versionsPrefix } from "../serving/origin.ts";
import { syncAccess } from "../sync-access.server.ts";
import type { Deck } from "../type.ts";
import type { RenameRow, Version } from "./type.ts";
import { minutesOf, versionOf } from "./version.ts";

export async function findVersion(deckId: string, n: number): Promise<Version | null> {
  const row = await db
    .select()
    .from(versions)
    .where(and(eq(versions.deckId, deckId), eq(versions.n, n)))
    .get();
  return row ? versionOf(row) : null;
}

/** The version readers see, or null before the first is published. */
export async function currentVersionOf(
  deck: Pick<Deck, "id" | "currentVersion">,
): Promise<Version | null> {
  return deck.currentVersion === null ? null : findVersion(deck.id, deck.currentVersion);
}

/** Every rename the deck's versions arrived with, in the order they were made. */
export async function renamesOf(deckId: string): Promise<RenameRow[]> {
  return db
    .select()
    .from(renames)
    .where(eq(renames.deckId, deckId))
    .orderBy(asc(renames.n), asc(renames.at))
    .all();
}

function staleBase(message: string): ApiError {
  return new ApiError(
    409,
    "stale_base",
    message,
    "someone published since; run `dekc pub status` and publish again",
  );
}

/** A publish made on a version that is not the current one. */
export function notOnCurrent(current: number | null, base: number | null): ApiError {
  return staleBase(`version ${current ?? "none"} is the current one, not ${base ?? "none"}`);
}

/**
 * Take the deck's next number, before writing under it. It is a counter, never given back: two
 * uploads never write to the same keys, and one cut short only skips its number.
 */
export async function claimVersion(deckId: string): Promise<number> {
  const [claimed] = await db
    .update(decks)
    .set({ latestVersion: sql`coalesce(${decks.latestVersion}, 0) + 1` })
    .where(eq(decks.id, deckId))
    .returning({ n: decks.latestVersion });
  if (claimed?.n === undefined || claimed.n === null) {
    throw new Error(`the deck ${deckId} is not there to number a version of`);
  }
  return claimed.n;
}

export async function putVersionFile(
  deckId: string,
  n: number,
  name: string,
  file: File,
  type: string,
): Promise<void> {
  await storage.put(versionKey(deckId, n, name), file, { httpMetadata: { contentType: type } });
}

export async function versionFile(deckId: string, n: number, name: string) {
  return storage.get(versionKey(deckId, n, name));
}

/**
 * Record a claimed version, all at once and only while the deck's current version is still
 * `base`: its row, the renames new with it, and on the deck the title and details the manifest
 * gives and the version readers see, this one. One that another publish beat to it is refused
 * with nothing of it recorded. The access file is written after it whatever changed, so one a
 * failed write left behind is put right.
 */
export async function recordVersion(
  deckId: string,
  n: number,
  base: number | null,
  upload: {
    manifest: VersionManifest;
    bytes: number;
    changed: readonly string[];
    renames: readonly Rename[];
  },
): Promise<void> {
  const { manifest } = upload;
  const onBase = and(
    eq(decks.id, deckId),
    base === null ? isNull(decks.currentVersion) : eq(decks.currentVersion, base),
  );
  // A row to insert, as a SELECT that yields it only while the deck is still on `base`; its fields
  // are in the order of the table's columns, as an INSERT … SELECT takes them.
  const whileOnBase = <Row extends Record<string, unknown>>(row: Row) =>
    db
      .select(
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [key, sql`${value}`.as(key)]),
        ) as { [Key in keyof Row]: ReturnType<ReturnType<typeof sql<Row[Key]>>["as"]> },
      )
      .from(decks)
      .where(onBase);
  const [, ...rest] = await db.batch([
    db.insert(versions).select(
      whileOnBase({
        deckId,
        n,
        dekVersion: manifest.dekVersion,
        slideMap: JSON.stringify(manifest.slideMap),
        lintErrors: manifest.lint.errors,
        lintWarnings: manifest.lint.warnings,
        bytes: upload.bytes,
        message: manifest.message ?? null,
        files: JSON.stringify(manifest.files),
        shots: JSON.stringify(manifest.shots),
        changed: JSON.stringify(upload.changed),
        createdAt: now,
      }),
    ),
    ...upload.renames.map((rename) =>
      db
        .insert(renames)
        .select(
          whileOnBase({ deckId, fromSlug: rename.from, toSlug: rename.to, at: rename.at, n }),
        ),
    ),
    // Last, so every statement before it saw the deck still on `base`.
    db
      .update(decks)
      .set({
        currentVersion: n,
        title: manifest.title,
        description: manifest.description ?? null,
        event: manifest.event ?? null,
        talkDate: manifest.date ?? null,
        minutes: minutesOf(manifest.duration),
        lang: manifest.lang ?? null,
        updatedAt: now,
      })
      .where(onBase)
      .returning({ id: decks.id }),
  ]);
  const updated = rest.at(-1) as Array<{ id: string }> | undefined;
  if (!updated || updated.length === 0) {
    throw staleBase("another version was published at the same moment");
  }
  await syncAccess(deckId);
}

/** Delete the files of version `n`, as for an upload that was never recorded. */
export async function deleteVersionFiles(deckId: string, n: number): Promise<void> {
  await deleteKeys(await keysUnder(versionKey(deckId, n, "")));
}

/**
 * Delete every version below `n`: their files in R2, those of uploads never recorded too, and
 * their rows. Nothing above `n` is touched, since another publish may be writing it. The renames
 * stay, since a thread opened on an older version is placed through them.
 */
export async function deleteVersionsBelow(deckId: string, n: number): Promise<void> {
  const prefix = versionsPrefix(deckId);
  const below = (await keysUnder(prefix)).filter((key) => {
    const m = Number(key.slice(prefix.length).split("/")[0]);
    return Number.isInteger(m) && m < n;
  });
  await deleteKeys(below);
  await db.delete(versions).where(and(eq(versions.deckId, deckId), lt(versions.n, n)));
}

async function keysUnder(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const listed = await storage.list({ prefix, ...(cursor === undefined ? {} : { cursor }) });
    keys.push(...listed.objects.map((object) => object.key));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor !== undefined);
  return keys;
}

/** R2 deletes at most 1000 keys at a time. */
async function deleteKeys(keys: readonly string[]): Promise<void> {
  for (let at = 0; at < keys.length; at += 1000) {
    await storage.delete(keys.slice(at, at + 1000));
  }
}
