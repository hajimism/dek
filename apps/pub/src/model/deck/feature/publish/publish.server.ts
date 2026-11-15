// Publishing a version: it must be made on the current one; the files are checked before anything
// is written, a number is taken, the files go to R2 under keys never reused, the version is
// recorded with what it changed if the deck is still on the version it was made on, and every
// version below it, which readers no longer see, is deleted after the answer.

import type { Context } from "hono";
import {
  MAX_VERSION_BYTES,
  type PublishResult,
  shotField,
  type VersionFile,
} from "../../../../../../../src/pub/protocol.ts";
import { ApiError } from "../../../../common/api-error.ts";
import { afterAnswer } from "../../../../common/http.server.ts";
import { log } from "../../../../common/log.ts";
import { deckById, shareUrl } from "../../store.server.ts";
import type { Deck } from "../../type.ts";
import {
  claimVersion,
  deleteVersionFiles,
  deleteVersionsBelow,
  findVersion,
  notOnCurrent,
  putVersionFile,
  recordVersion,
  renamesOf,
} from "../../version/store.server.ts";
import { checkContents, fileName, isPng, KINDS, newRenames, readManifest } from "./manifest.ts";
import { slideChanges } from "./slide-diff.ts";

/** What the multipart framing and the manifest may add to the files. */
const FORM_OVERHEAD = 4 * 1024 * 1024;

const tooLarge = () => new ApiError(413, "too_large", "a version may hold 50 MiB at most");

export async function publish(c: Context, deck: Deck): Promise<PublishResult> {
  // The whole form is read into memory to parse it, so its size is refused before that.
  const length = Number(c.req.header("content-length"));
  if (!Number.isFinite(length) || length <= 0) {
    throw new ApiError(411, "length_required", "send the upload with its content-length");
  }
  if (length > MAX_VERSION_BYTES + FORM_OVERHEAD) {
    throw tooLarge();
  }
  const form = await c.req.parseBody({ all: false });
  const manifest = readManifest(form.manifest);
  const base = manifest.base;
  if (base !== deck.currentVersion) {
    throw notOnCurrent(deck.currentVersion, base);
  }
  checkContents(manifest);

  // Every file is checked before anything is written: its kind by its first bytes, and its
  // bytes against the hash the manifest gives.
  const files: Array<{ name: string; file: File; type: string }> = [];
  let bytes = 0;
  const take = async (
    field: string,
    name: string,
    expected: string,
    type: string,
    check: (head: Uint8Array) => boolean,
  ) => {
    const value = form[field];
    if (!(value instanceof File)) {
      throw new ApiError(422, "missing_file", `the form has no file ${field}`);
    }
    bytes += value.size;
    if (bytes > MAX_VERSION_BYTES) {
      throw tooLarge();
    }
    if (!check(new Uint8Array(await value.slice(0, 512).arrayBuffer()))) {
      throw new ApiError(415, "wrong_kind", `${field} is not what its name says`);
    }
    if (expected !== (await sha256(value))) {
      throw new ApiError(422, "hash_mismatch", `${field} does not match its hash in the manifest`);
    }
    files.push({ name, file: value, type });
  };
  for (const [name, hash] of Object.entries(manifest.files) as Array<[VersionFile, string]>) {
    await take(name, fileName(name), hash, KINDS[name].type, KINDS[name].check);
  }
  for (const [slug, hash] of Object.entries(manifest.shots)) {
    await take(shotField(slug), `shots/${slug}.png`, hash, "image/png", isPng);
  }

  const n = await claimVersion(deck.id);
  try {
    for (const { name, file, type } of files) {
      await putVersionFile(deck.id, n, name, file, type);
    }
    const known = (await renamesOf(deck.id)).map((row) => ({
      from: row.fromSlug,
      to: row.toSlug,
      at: row.at,
    }));
    const renames = newRenames(manifest.renames, known);
    const before = base ? await findVersion(deck.id, base) : null;
    const changed = slideChanges(
      before ? { map: before.slideMap, shots: before.shots } : null,
      { map: manifest.slideMap, shots: manifest.shots },
      renames,
    )
      .filter((change) => change.change !== "removed")
      .map((change) => change.slug);
    await recordVersion(deck.id, n, base, { manifest, bytes, changed, renames });
  } catch (error) {
    // A version recorded stays, even if writing the access file after it failed. The files of
    // one not recorded go, as far as they can; its number is skipped.
    if (!(await findVersion(deck.id, n))) {
      await deleteVersionFiles(deck.id, n).catch((cleanup: unknown) =>
        log("error", "the files of a version not recorded were not deleted", cleanup),
      );
    }
    throw error;
  }
  // Every version below this one, and what a publish cut short left, once the answer has gone: a
  // cleanup that fails is logged, and the next publish sweeps again.
  afterAnswer(c, deleteVersionsBelow(deck.id, n));

  const updated = (await deckById(deck.id)) ?? deck;
  return {
    id: deck.id,
    n,
    current: updated.currentVersion,
    url: await shareUrl(c, updated),
    visibility: updated.visibility,
  };
}

/** A file's sha256, read as a stream so it is not copied whole a second time. */
async function sha256(file: File): Promise<string> {
  // DigestStream is the Workers runtime's; the DOM types the checker also loads do not have it.
  const { DigestStream } = crypto as unknown as {
    DigestStream: new (
      algorithm: string,
    ) => WritableStream<Uint8Array> & { digest: Promise<ArrayBuffer> };
  };
  const stream = new DigestStream("SHA-256");
  await file.stream().pipeTo(stream);
  const digest = new Uint8Array(await stream.digest);
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
