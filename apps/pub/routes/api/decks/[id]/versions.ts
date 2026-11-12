// Uploading a version. The CLI built it; the server checks only what it can without building:
// the manifest, that each file is what its hash says and the kind it claims to be, and that the
// version it was made on is still the newest. Then the files go to R2 under keys never reused.

import { decks, renames, versions } from "@schema";
import { defineHandler } from "void";
import { db, eq, sql } from "void/db";
import { storage } from "void/storage";
import {
  PROTOCOL_VERSION,
  type PublishResult,
  shotField,
  type VersionFile,
  VersionManifest,
} from "../../../../../../src/pub/protocol.ts";
import { versionKey } from "../../../../src/lib/deck-origin.ts";
import { slideChanges } from "../../../../src/lib/slide-diff.ts";
import { requirePerson } from "../../../../src/server/actor.ts";
import {
  deckById,
  ownedDeck,
  talkUrl,
  versionRow,
  versionRows,
  versionSummary,
  writeAccess,
} from "../../../../src/server/decks.ts";
import { ApiError, api } from "../../../../src/server/http.ts";

/** The most one version may hold, all files together. */
const VERSION_BYTES = 50 * 1024 * 1024;

const KINDS: Record<VersionFile, { type: string; check: (bytes: Uint8Array) => boolean }> = {
  full: { type: "text/html; charset=utf-8", check: isHtml },
  public: { type: "text/html; charset=utf-8", check: isHtml },
  bare: { type: "text/html; charset=utf-8", check: isHtml },
  source: { type: "application/x-tar", check: isTar },
  cover: { type: "image/png", check: isPng },
};

export const GET = defineHandler((c) =>
  api(async () => {
    const person = await requirePerson(c);
    const deck = await ownedDeck(c.req.param("id") ?? "", person);
    return { versions: (await versionRows(deck.id)).map(versionSummary) };
  }),
);

export const POST = defineHandler((c) =>
  api(async () => {
    const person = await requirePerson(c);
    const deck = await ownedDeck(c.req.param("id") ?? "", person);
    const form = await c.req.parseBody({ all: false });

    const manifest = readManifest(form.manifest);
    if (manifest.protocol > PROTOCOL_VERSION) {
      throw new ApiError(400, "protocol", `this server reads protocol ${PROTOCOL_VERSION}, not ${manifest.protocol}`);
    }
    if (manifest.base !== deck.latestVersion) {
      throw new ApiError(
        409,
        "stale_base",
        `version ${deck.latestVersion ?? "none"} is the newest, not ${manifest.base ?? "none"}`,
        "someone published since; run `dekc pub status` and publish again",
      );
    }

    const files = new Map<string, { bytes: Uint8Array<ArrayBuffer>; type: string }>();
    let total = 0;
    const take = async (field: string, expected: string | undefined, type: string, check: (bytes: Uint8Array) => boolean) => {
      const value = form[field];
      if (!(value instanceof File)) {
        throw new ApiError(422, "missing_file", `the form has no file ${field}`);
      }
      const bytes = new Uint8Array(await value.arrayBuffer());
      total += bytes.byteLength;
      if (total > VERSION_BYTES) {
        throw new ApiError(413, "too_large", "a version may hold 50 MiB at most");
      }
      if (!check(bytes)) {
        throw new ApiError(415, "wrong_kind", `${field} is not what its name says`);
      }
      if (expected !== (await sha256(bytes))) {
        throw new ApiError(422, "hash_mismatch", `${field} does not match its hash in the manifest`);
      }
      files.set(field, { bytes, type });
    };

    for (const required of ["full", "public", "source"] as const) {
      if (!manifest.files[required]) {
        throw new ApiError(422, "missing_file", `the manifest names no ${required}`);
      }
    }
    for (const [name, hash] of Object.entries(manifest.files) as Array<[VersionFile, string]>) {
      await take(name, hash, KINDS[name].type, KINDS[name].check);
    }
    const slugs = new Set(manifest.slideMap.slides.map((slide) => slide.slug));
    for (const [slug, hash] of Object.entries(manifest.shots)) {
      if (!slugs.has(slug)) {
        throw new ApiError(422, "unknown_slide", `a picture is sent for ${slug}, which the slide map lacks`);
      }
      await take(shotField(slug), hash, "image/png", isPng);
    }

    const n = (deck.latestVersion ?? 0) + 1;
    for (const [field, file] of files) {
      const name = field.startsWith("shot:") ? `shots/${field.slice(5)}.png` : fileName(field as VersionFile);
      await storage.put(versionKey(deck.id, n, name), file.bytes, { httpMetadata: { contentType: file.type } });
    }

    const before = deck.latestVersion ? await versionRow(deck.id, deck.latestVersion) : null;
    const changed = slideChanges(
      before ? { map: JSON.parse(before.slideMap), shots: JSON.parse(before.shots) } : null,
      { map: manifest.slideMap, shots: manifest.shots },
    )
      .filter((change) => change.change !== "removed")
      .map((change) => change.slug);

    const promote = c.req.query("promote") !== "0";
    const known = new Set(
      (await db.select().from(renames).where(eq(renames.deckId, deck.id)).all()).map(
        (row) => `${row.fromSlug}\u0000${row.toSlug}\u0000${row.at}`,
      ),
    );
    const fresh = manifest.renames.filter((rename) => !known.has(`${rename.from}\u0000${rename.to}\u0000${rename.at}`));

    try {
      await db.batch([
        db.insert(versions).values({
          deckId: deck.id,
          n,
          dekVersion: manifest.dekVersion,
          slideMap: JSON.stringify(manifest.slideMap),
          lintErrors: manifest.lint.errors,
          lintWarnings: manifest.lint.warnings,
          bytes: total,
          message: manifest.message ?? null,
          files: JSON.stringify(manifest.files),
          shots: JSON.stringify(manifest.shots),
          changed: JSON.stringify(changed),
        }),
        db
          .update(decks)
          .set({
            latestVersion: n,
            ...(promote ? { currentVersion: n } : {}),
            title: manifest.title,
            description: manifest.description ?? null,
            event: manifest.event ?? null,
            talkDate: manifest.date ?? null,
            lang: manifest.lang ?? null,
            updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
          })
          .where(eq(decks.id, deck.id)),
        ...fresh.map((rename) =>
          db.insert(renames).values({ deckId: deck.id, fromSlug: rename.from, toSlug: rename.to, at: rename.at, n }),
        ),
      ]);
    } catch (error) {
      if (String(error).includes("UNIQUE") || String(error).includes("PRIMARY KEY")) {
        throw new ApiError(409, "stale_base", "another version was published at the same moment", "run `dekc pub status` and publish again");
      }
      throw error;
    }

    const updated = await deckById(deck.id);
    if (!updated) {
      throw new Error("the deck just updated is not there");
    }
    await writeAccess(updated);
    const result: PublishResult = {
      id: deck.id,
      n,
      current: updated.currentVersion,
      url: talkUrl(person.handle, deck.slug),
      visibility: updated.visibility,
    };
    return Response.json(result, { status: 201 });
  }),
);

function readManifest(value: unknown): VersionManifest {
  if (typeof value !== "string") {
    throw new ApiError(422, "missing_manifest", "the form has no manifest field");
  }
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    throw new ApiError(400, "bad_json", "the manifest is not JSON");
  }
  const parsed = VersionManifest.safeParse(json);
  if (!parsed.success) {
    throw new ApiError(
      422,
      "invalid_manifest",
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
    );
  }
  return parsed.data;
}

function fileName(file: VersionFile): string {
  return file === "source" ? "source.tar" : file === "cover" ? "cover.png" : `${file}.html`;
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isHtml(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.subarray(0, 256)).trimStart().toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html");
}

function isTar(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes.subarray(257, 262)) === "ustar";
}

function isPng(bytes: Uint8Array): boolean {
  const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return magic.every((byte, index) => bytes[index] === byte);
}
