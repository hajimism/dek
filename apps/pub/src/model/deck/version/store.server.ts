// Versions in D1 and their files in R2. The deck row keeps the newest version's number, so a
// version is claimed there before its files are written, and recorded together with what it
// changes on the deck.

import { decks, renames, versions } from "@schema";
import { and, asc, db, desc, eq, isNull } from "void/db";
import { storage } from "void/storage";
import type { Rename, VersionManifest } from "../../../../../../src/pub/protocol.ts";
import { ApiError } from "../../../common/api-error.ts";
import { now } from "../../../common/db.server.ts";
import { versionKey } from "../serving/origin.ts";
import type { RenameRow, Version } from "./type.ts";
import { versionOf } from "./version.ts";

export async function versionsOf(deckId: string): Promise<Version[]> {
  const rows = await db
    .select()
    .from(versions)
    .where(eq(versions.deckId, deckId))
    .orderBy(desc(versions.n))
    .all();
  return rows.map(versionOf);
}

export async function findVersion(deckId: string, n: number): Promise<Version | null> {
  const row = await db
    .select()
    .from(versions)
    .where(and(eq(versions.deckId, deckId), eq(versions.n, n)))
    .get();
  return row ? versionOf(row) : null;
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

export function staleBase(latest: number | null, base: number | null): ApiError {
  return new ApiError(
    409,
    "stale_base",
    latest === null
      ? "another version was published at the same moment"
      : `version ${latest} is the newest, not ${base ?? "none"}`,
    "someone published since; run `dekc pub status` and publish again",
  );
}

/**
 * Claim the number after `base` before writing under it, so two uploads made on the same base
 * never write to the same keys: the one that loses the claim gets a 409 and writes nothing.
 */
export async function claimVersion(deckId: string, base: number | null): Promise<number> {
  const n = (base ?? 0) + 1;
  const claimed = await db
    .update(decks)
    .set({ latestVersion: n })
    .where(
      and(
        eq(decks.id, deckId),
        base === null ? isNull(decks.latestVersion) : eq(decks.latestVersion, base),
      ),
    )
    .returning({ n: decks.latestVersion });
  if (claimed.length === 0) {
    throw staleBase(null, base);
  }
  return n;
}

/** Give a claimed number back, so the next publish on its base is not refused. */
export async function releaseVersion(
  deckId: string,
  n: number,
  base: number | null,
): Promise<void> {
  await db
    .update(decks)
    .set({ latestVersion: base })
    .where(and(eq(decks.id, deckId), eq(decks.latestVersion, n)));
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
 * Record a claimed version, all at once: its row, the renames new with it, and on the deck the
 * title and details the manifest gives and, unless held back, the version readers see.
 */
export async function recordVersion(
  deckId: string,
  n: number,
  upload: {
    manifest: VersionManifest;
    bytes: number;
    changed: readonly string[];
    renames: readonly Rename[];
    promote: boolean;
  },
): Promise<void> {
  const { manifest } = upload;
  await db.batch([
    db.insert(versions).values({
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
    }),
    db
      .update(decks)
      .set({
        ...(upload.promote ? { currentVersion: n } : {}),
        title: manifest.title,
        description: manifest.description ?? null,
        event: manifest.event ?? null,
        talkDate: manifest.date ?? null,
        lang: manifest.lang ?? null,
        updatedAt: now,
      })
      .where(eq(decks.id, deckId)),
    ...upload.renames.map((rename) =>
      db
        .insert(renames)
        .values({ deckId, fromSlug: rename.from, toSlug: rename.to, at: rename.at, n }),
    ),
  ]);
}
