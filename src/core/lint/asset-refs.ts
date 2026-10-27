import { existsSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { classifyAssetRef, isCanonicalAssetPath } from "../assets.ts";
import { type Diagnostic, diag } from "../diagnostic.ts";
import { isPlainWord } from "../escape.ts";
import type { HtmlRef } from "../html-scan.ts";
import { isInside } from "../path.ts";
import { trimUrl } from "../url-attributes.ts";

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
        message: `missing ${ref.tag === "img" ? "image" : "file"} "${visibleSpaces(ref.value)}"`,
        ...location,
        ...(strayedSpaceHint(ref.value, deckDir, from) ?? missingImageHint(ref.value, deckDir)),
        data: { src: ref.value },
      }),
    ];
  }
  if (!isCanonicalAssetPath(ref.value)) {
    return [
      diag("DEK023", {
        message: `asset "${ref.value}" must be referenced as assets/${posix.basename(trimUrl(ref.value))}`,
        ...location,
        data: { src: ref.value },
      }),
    ];
  }
  return [];
}

function leavesFromEither(value: string, deckDir: string, from: string): boolean {
  const path = trimUrl(value).split(/[?#]/)[0] ?? "";
  return (
    path !== "" &&
    [resolve(deckDir, path), resolve(from, path)].some((target) => !isInside(target, deckDir))
  );
}

/** `value` with each space but the plain one written as `\uXXXX`, so a message shows it. */
function visibleSpaces(value: string): string {
  return value.replace(
    /[^\S ]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`,
  );
}

/**
 * The hint for a path that names a deck file once the spaces outside ASCII at its ends are gone,
 * as `&nbsp;assets/a.png` does: the browser keeps those spaces, so the path names nothing.
 */
function strayedSpaceHint(
  value: string,
  deckDir: string,
  from: string,
): { hint: string } | undefined {
  const url = trimUrl(value);
  const bare = url.trim();
  if (bare === url || classifyAssetRef(bare, { deckDir, from }).kind !== "file") {
    return undefined;
  }
  const at = url.indexOf(bare);
  const before = url.slice(0, at);
  const after = url.slice(at + bare.length);
  const where = before && after ? "around" : before ? "before" : "after";
  const spaces = [...new Set(before + after)].map((char) => {
    const point = `U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
    return char === "\u00A0" ? `no-break space (${point})` : `space (${point})`;
  });
  return {
    hint: `remove the ${spaces.join(" and the ")} ${where} ${bare}: the browser keeps ${spaces.length > 1 ? "them" : "it"} as part of the path, which then names no file`,
  };
}

/**
 * Decks copy what they use from the project's `assets/` (so a deck stays whole when moved);
 * when the project has the file, the fix is that copy.
 */
function missingImageHint(value: string, deckDir: string): { hint?: string } {
  const name = trimUrl(value).split(/[?#]/)[0] ?? "";
  if (!name.startsWith("assets/")) {
    return {};
  }
  const projectFile = join(dirname(dirname(deckDir)), name);
  if (!existsSync(projectFile)) {
    return {};
  }
  // The name is the slide's text: one that is no plain word is left out of the hint.
  const copy = isPlainWord(name) ? `../../${name}` : "it from the project's assets/";
  return { hint: `the project has it: copy ${copy} into the deck's assets/` };
}

function remoteHint(value: string): string {
  let name = "";
  try {
    name = posix.basename(new URL(trimUrl(value), "https://dek.invalid").pathname);
  } catch {}
  // The name is the remote URL's: one that is no plain word is left out of the hint.
  return name && isPlainWord(name)
    ? `download it into assets/ and use assets/${name}`
    : "download it into assets/ and reference it from there";
}
