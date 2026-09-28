import { existsSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { classifyAssetRef, isCanonicalAssetPath } from "../assets.ts";
import { type Diagnostic, diag } from "../diagnostic.ts";
import type { HtmlRef } from "../html-scan.ts";

/**
 * DEK020 to DEK023 for one reference, whether it comes from a slide's markup
 * or a stylesheet's `url()`. A resource the page loads must exist and be written
 * as `assets/...`; a link must only stay local and inside the deck.
 */
export function assetRefDiagnostics(
  ref: Pick<HtmlRef, "value" | "use"> & { tag?: string },
  where: { path: string; line?: number; column?: number; slug?: string; deckDir: string },
): Diagnostic[] {
  const { deckDir, ...location } = where;
  const kind = classifyAssetRef(ref.value, { deckDir, from: dirname(where.path) }).kind;
  if (kind === "skip") {
    return [];
  }
  if (kind === "remote") {
    return [
      diag("DEK020", {
        message: `remote URL "${ref.value}"`,
        ...location,
        hint: remoteHint(ref.value),
        data: { url: ref.value },
      }),
    ];
  }
  if (kind === "escape") {
    return [
      diag("DEK022", {
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
      diag("DEK021", {
        message: `missing ${ref.tag === "img" ? "image" : "file"} "${ref.value}"`,
        ...location,
        ...missingImageHint(ref.value, deckDir),
        data: { src: ref.value },
      }),
    ];
  }
  if (!isCanonicalAssetPath(ref.value)) {
    return [
      diag("DEK023", {
        message: `asset "${ref.value}" must be referenced as assets/${posix.basename(ref.value.trim())}`,
        ...location,
        data: { src: ref.value },
      }),
    ];
  }
  return [];
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
    name = posix.basename(new URL(value.trim(), "https://dek.invalid").pathname);
  } catch {}
  return name
    ? `download it into assets/ and use assets/${name}`
    : "download it into assets/ and reference it from there";
}
