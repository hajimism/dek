// Uploading a version. The CLI built it; the server checks only what it can without building:
// the manifest, that each file is what its hash says and the kind it claims to be, and that the
// version it was made on is still the newest. Then the files go to R2 under keys never reused.

import { decks, renames, versions } from "@schema";
import { defineHandler } from "void";
import { and, db, eq, isNull, sql } from "void/db";
import { storage } from "void/storage";
import {
  PROTOCOL_VERSION,
  type PublishResult,
  type Rename,
  shotField,
  type VersionFile,
  VersionManifest,
} from "../../../../../../src/pub/protocol.ts";
import { versionKey } from "../../../../src/model/deck/serving/origin.ts";
import { slideChanges } from "../../../../src/model/deck/feature/publish/slide-diff.ts";
import { requirePerson } from "../../../../src/model/person/feature/auth/actor.server.ts";
import {
  deckById,
  ownedDeck,
  talkUrl,
  versionRow,
  versionRows,
  versionSummary,
  writeAccess,
} from "../../../../src/model/deck/store.server.ts";
import { ApiError, api } from "../../../../src/common/http.server.ts";

/** The most one version may hold, all files together. */
const VERSION_BYTES = 50 * 1024 * 1024;

/** What the multipart framing and the manifest may add to the files. */
const FORM_OVERHEAD = 4 * 1024 * 1024;

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
  }, c.req.raw),
);

export const POST = defineHandler((c) =>
  api(async () => {
    const person = await requirePerson(c);
    const deck = await ownedDeck(c.req.param("id") ?? "", person);
    // The whole form is read into memory to parse it, so its size is refused before that.
    const length = Number(c.req.header("content-length"));
    if (!Number.isFinite(length) || length <= 0) {
      throw new ApiError(411, "length_required", "send the upload with its content-length");
    }
    if (length > VERSION_BYTES + FORM_OVERHEAD) {
      throw new ApiError(413, "too_large", "a version may hold 50 MiB at most");
    }
    const form = await c.req.parseBody({ all: false });

    const manifest = readManifest(form.manifest);
    if (manifest.protocol > PROTOCOL_VERSION) {
      throw new ApiError(400, "protocol", `this server reads protocol ${PROTOCOL_VERSION}, not ${manifest.protocol}`);
    }
    const base = manifest.base;
    if (base !== deck.latestVersion) {
      throw staleBase(deck.latestVersion, base);
    }

    // Every file is checked before anything is written: its kind by its first bytes, and its
    // bytes against the hash the manifest gives.
    const files: Array<{ key: string; file: File; type: string }> = [];
    let total = 0;
    const take = async (field: string, name: string, expected: string, type: string, check: (head: Uint8Array) => boolean) => {
      const value = form[field];
      if (!(value instanceof File)) {
        throw new ApiError(422, "missing_file", `the form has no file ${field}`);
      }
      total += value.size;
      if (total > VERSION_BYTES) {
        throw new ApiError(413, "too_large", "a version may hold 50 MiB at most");
      }
      if (!check(new Uint8Array(await value.slice(0, 512).arrayBuffer()))) {
        throw new ApiError(415, "wrong_kind", `${field} is not what its name says`);
      }
      if (expected !== (await sha256(value))) {
        throw new ApiError(422, "hash_mismatch", `${field} does not match its hash in the manifest`);
      }
      files.push({ key: name, file: value, type });
    };

    for (const required of ["full", "public", "bare", "source"] as const) {
      if (!manifest.files[required]) {
        throw new ApiError(422, "missing_file", `the manifest names no ${required}`, "publish with a dekc that builds the slides alone too");
      }
    }
    for (const [name, hash] of Object.entries(manifest.files) as Array<[VersionFile, string]>) {
      await take(name, fileName(name), hash, KINDS[name].type, KINDS[name].check);
    }
    const slugs = new Set(manifest.slideMap.slides.map((slide) => slide.slug));
    for (const [slug, hash] of Object.entries(manifest.shots)) {
      if (!slugs.has(slug)) {
        throw new ApiError(422, "unknown_slide", `a picture is sent for ${slug}, which the slide map lacks`);
      }
      await take(shotField(slug), `shots/${slug}.png`, hash, "image/png", isPng);
    }

    // Claim the version number before writing under it, so two uploads made on the same base
    // never write to the same keys: the one that loses the claim gets a 409 and writes nothing.
    const n = (base ?? 0) + 1;
    const claimed = await db
      .update(decks)
      .set({ latestVersion: n })
      .where(and(eq(decks.id, deck.id), base === null ? isNull(decks.latestVersion) : eq(decks.latestVersion, base)))
      .returning({ n: decks.latestVersion });
    if (claimed.length === 0) {
      throw staleBase(null, base);
    }

    try {
      for (const { key, file, type } of files) {
        await storage.put(versionKey(deck.id, n, key), file, { httpMetadata: { contentType: type } });
      }
      const known = new Set(
        (await db.select().from(renames).where(eq(renames.deckId, deck.id)).all()).map(
          (row) => `${row.fromSlug}\u0000${row.toSlug}\u0000${row.at}`,
        ),
      );
      const fresh = uniqueRenames(manifest.renames).filter(
        (rename) => !known.has(`${rename.from}\u0000${rename.to}\u0000${rename.at}`),
      );
      const before = base ? await versionRow(deck.id, base) : null;
      const changed = slideChanges(
        before ? { map: JSON.parse(before.slideMap), shots: JSON.parse(before.shots) } : null,
        { map: manifest.slideMap, shots: manifest.shots },
        fresh,
      )
        .filter((change) => change.change !== "removed")
        .map((change) => change.slug);
      const promote = c.req.query("promote") !== "0";

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
      // Give the number back, so the next publish on this base is not refused.
      await db
        .update(decks)
        .set({ latestVersion: base })
        .where(and(eq(decks.id, deck.id), eq(decks.latestVersion, n)));
      throw error;
    }

    await writeAccess(deck.id);
    const updated = await deckById(deck.id);
    const result: PublishResult = {
      id: deck.id,
      n,
      current: updated?.currentVersion ?? null,
      url: talkUrl(person.handle, deck.slug),
      visibility: updated?.visibility ?? deck.visibility,
    };
    return Response.json(result, { status: 201 });
  }, c.req.raw),
);

function staleBase(latest: number | null, base: number | null): ApiError {
  return new ApiError(
    409,
    "stale_base",
    latest === null
      ? "another version was published at the same moment"
      : `version ${latest} is the newest, not ${base ?? "none"}`,
    "someone published since; run `dekc pub status` and publish again",
  );
}

function uniqueRenames(list: readonly Rename[]): Rename[] {
  const seen = new Set<string>();
  return list.filter((rename) => {
    const key = `${rename.from}\u0000${rename.to}\u0000${rename.at}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

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

/** A file's sha256, read as a stream so it is not copied whole a second time. */
async function sha256(file: File): Promise<string> {
  // DigestStream is the Workers runtime's; the DOM types the checker also loads do not have it.
  const { DigestStream } = crypto as unknown as { DigestStream: new (algorithm: string) => WritableStream<Uint8Array> & { digest: Promise<ArrayBuffer> } };
  const stream = new DigestStream("SHA-256");
  await file.stream().pipeTo(stream);
  const digest = new Uint8Array(await stream.digest);
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
