import { existsSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { classifyAssetRef, isCanonicalAssetPath } from "../assets.ts";
import { type Diagnostic, diag } from "../diagnostic.ts";
import type { HtmlRef } from "../html-scan.ts";
import { isInside } from "../path.ts";

/**
 * DEKC020 to DEKC023 for one reference, whether it comes from a slide's markup
 * or a stylesheet's `url()`. A resource the page loads must exist and be written
 * as `assets/...`; a link must only stay local and inside the deck.
 */
export function assetRefDiagnostics(
  ref: Pick<HtmlRef, "value" | "use"> & { tag?: string },
  where: { path: string; line?: number; column?: number; slug?: string; deckDir: string },
): Diagnostic[] {
  const { deckDir, ...location } = where;
  const from = dirname(where.path);
  const classified = classifyAssetRef(ref.value, { deckDir, from }).kind;
  // A link someone follows, `<a>` or `<area>`, leaves from wherever the slide is read, the deck
  // or its slides/, and must stay in the deck from both. A resource is found from either, and a
  // full document's `<link>` sits in the head the deck never shows.
  const followed = ref.use === "link" && ref.tag !== "link";
  const kind =
    followed &&
    (classified === "missing" || classified === "file") &&
    leavesFromEither(ref.value, deckDir, from)
      ? "escape"
      : classified;
  if (kind === "skip") {
    return [];
  }
  if (kind === "remote") {
    return [
      diag("DEKC020", {
        message: `remote URL "${ref.value}"`,
        ...location,
        hint: remoteHint(ref.value),
        data: { url: ref.value },
      }),
    ];
  }
  if (kind === "escape") {
    return [
      diag("DEKC022", {
        message: `path "${ref.value}" is outside the deck directory`,
        ...location,
        data: { path: ref.value },
      }),
    ];
  }
  if (ref.use === "link") {
    return [];
  }
  if (kind === "missing") {
    return [
      diag("DEKC021", {
        message: `missing ${ref.tag === "img" ? "image" : "file"} "${ref.value}"`,
        ...location,
        ...missingImageHint(ref.value, deckDir),
        data: { src: ref.value },
      }),
    ];
  }
  if (!isCanonicalAssetPath(ref.value)) {
    return [
      diag("DEKC023", {
        message: `asset "${ref.value}" must be referenced as assets/${posix.basename(ref.value.trim())}`,
        ...location,
        data: { src: ref.value },
      }),
    ];
  }
  return [];
}

function leavesFromEither(value: string, deckDir: string, from: string): boolean {
  const path = value.trim().split(/[?#]/)[0] ?? "";
  return (
    path !== "" &&
    [resolve(deckDir, path), resolve(from, path)].some((target) => !isInside(target, deckDir))
  );
}

/**
 * Decks copy what they use from the project's `assets/` (so a deck stays whole when moved);
 * when the project has the file, the fix is that copy.
 */
function missingImageHint(value: string, deckDir: string): { hint?: string } {
  const name = value.trim().split(/[?#]/)[0] ?? "";
  if (!name.startsWith("assets/")) {
    return {};
  }
  const projectFile = join(dirname(dirname(deckDir)), name);
  if (!existsSync(projectFile)) {
    return {};
  }
  return { hint: `the project has it: copy ../../${name} into the deck's assets/` };
}

function remoteHint(value: string): string {
  let name = "";
  try {
    name = posix.basename(new URL(value.trim(), "https://dekc.invalid").pathname);
  } catch {}
  return name
    ? `download it into assets/ and use assets/${name}`
    : "download it into assets/ and reference it from there";
}
