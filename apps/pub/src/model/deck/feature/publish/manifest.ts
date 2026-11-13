// What an upload must be before anything of it is kept: a manifest the server can read, and each
// file of the kind its name says. The CLI built the version; the server checks only what it can
// without building it.

import {
  PROTOCOL_VERSION,
  type Rename,
  type VersionFile,
  VersionManifest,
} from "../../../../../../../src/pub/protocol.ts";
import { ApiError } from "../../../../common/api-error.ts";

export const KINDS: Record<VersionFile, { type: string; check: (head: Uint8Array) => boolean }> = {
  full: { type: "text/html; charset=utf-8", check: isHtml },
  public: { type: "text/html; charset=utf-8", check: isHtml },
  bare: { type: "text/html; charset=utf-8", check: isHtml },
  source: { type: "application/x-tar", check: isTar },
  cover: { type: "image/png", check: isPng },
};

/** The builds every version has, so a reader always gets one. */
const REQUIRED_FILES = ["full", "public", "bare", "source"] as const;

export function readManifest(value: unknown): VersionManifest {
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
  if (parsed.data.protocol > PROTOCOL_VERSION) {
    throw new ApiError(
      400,
      "protocol",
      `this server reads protocol ${PROTOCOL_VERSION}, not ${parsed.data.protocol}`,
    );
  }
  return parsed.data;
}

/** Refuse a manifest that leaves out a build, or sends a picture of a slide it does not have. */
export function checkContents(manifest: VersionManifest): void {
  for (const required of REQUIRED_FILES) {
    if (!manifest.files[required]) {
      throw new ApiError(
        422,
        "missing_file",
        `the manifest names no ${required}`,
        "publish with a dekc that builds the slides alone too",
      );
    }
  }
  const slugs = new Set(manifest.slideMap.slides.map((slide) => slide.slug));
  for (const slug of Object.keys(manifest.shots)) {
    if (!slugs.has(slug)) {
      throw new ApiError(
        422,
        "unknown_slide",
        `a picture is sent for ${slug}, which the slide map lacks`,
      );
    }
  }
}

/** The name a file of the version has in R2. */
export function fileName(file: VersionFile): string {
  return file === "source" ? "source.tar" : file === "cover" ? "cover.png" : `${file}.html`;
}

const renameKey = (rename: Rename) => `${rename.from}\u0000${rename.to}\u0000${rename.at}`;

/** The renames of `list` not already among `known`, each once. */
export function newRenames(list: readonly Rename[], known: readonly Rename[]): Rename[] {
  const seen = new Set(known.map(renameKey));
  return list.filter((rename) => {
    const key = renameKey(rename);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function isHtml(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.subarray(0, 256)).trimStart().toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html");
}

function isTar(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes.subarray(257, 262)) === "ustar";
}

export function isPng(bytes: Uint8Array): boolean {
  const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return magic.every((byte, index) => bytes[index] === byte);
}
