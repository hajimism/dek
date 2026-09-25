import { readFileSync, realpathSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { minifyCss, replaceCssUrls, scopeSlideCss } from "./css.ts";
import { isInside } from "./path.ts";
import { listSlideFiles, readDeckFile } from "./resolve.ts";
import { attributeUrls } from "./url-attributes.ts";

/** Where one reference from a slide or a stylesheet points. */
export type AssetRef =
  /** Nothing to resolve: empty, a fragment, a data: URI, or another scheme. */
  | { kind: "skip" }
  | { kind: "remote" }
  /** A local path that leaves the deck directory. */
  | { kind: "escape" }
  /** A local path inside the deck that names no file. */
  | { kind: "missing" }
  | { kind: "file"; path: string; deckPath: string };

const REMOTE_RE = /^(https?:)?\/\//i;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Resolves a reference the one way lint, show, and the build agree on: the
 * deck root first, which is where the dev server and the build look for
 * `assets/`, then next to the file that names it, so `../assets/x` from
 * slides/ still resolves. A query string or fragment is not part of the path.
 */
export function classifyAssetRef(
  raw: string,
  options: { deckDir: string; from: string },
): AssetRef {
  const value = raw.trim().split(/[?#]/)[0] ?? "";
  if (!value) {
    return { kind: "skip" };
  }
  if (REMOTE_RE.test(value)) {
    return { kind: "remote" };
  }
  if (SCHEME_RE.test(value)) {
    return { kind: "skip" };
  }
  const found = [resolve(options.deckDir, value), resolve(options.from, value)]
    .filter((path) => isInside(path, options.deckDir))
    .map((path) => fileInside(path, options.deckDir));
  const file = found.find((ref) => ref.kind === "file");
  if (file) {
    return { ...file, deckPath: relative(options.deckDir, file.path).split(sep).join("/") };
  }
  // A link out of the deck outranks a path that names nothing: the author wrote a file that is there.
  return found.length > 0 && found.every((ref) => ref.kind === "missing")
    ? { kind: "missing" }
    : { kind: "escape" };
}

/**
 * Where `path` stands against `root`, judged by where it really lives: a symlink under `root`
 * that leads out of it escapes, like `../` does, so neither the build nor the dev server reads
 * a file the deck does not hold. The path itself comes back as written.
 */
export function fileInside(
  path: string,
  root: string,
): { kind: "escape" } | { kind: "missing" } | { kind: "file"; path: string } {
  if (!isInside(path, root)) {
    return { kind: "escape" };
  }
  let real: string;
  try {
    real = realpathSync(path);
  } catch {
    return { kind: "missing" };
  }
  if (!isInside(real, realpathSync(root))) {
    return { kind: "escape" };
  }
  return statSync(real).isFile() ? { kind: "file", path } : { kind: "missing" };
}

/** True when a reference is written as `assets/...` from the deck root, or is not a local path at all. */
export function isCanonicalAssetPath(raw: string): boolean {
  const value = raw.trim();
  if (!value || value.startsWith("#") || SCHEME_RE.test(value) || REMOTE_RE.test(value)) {
    return true;
  }
  return value.startsWith("assets/");
}

/**
 * Slide markup with each local resource replaced by a data: URI, so the build stands alone; `from`
 * is the directory the markup lives in. The URLs are the ones lint checks, read by the same
 * parser: every candidate of a `srcset` keeps its descriptors, links and text stay as written.
 */
export function inlineAssets(
  html: string,
  deckDir: string,
  from = join(deckDir, "slides"),
): string {
  const output = new HTMLRewriter()
    .on("*", {
      element(el) {
        const tag = el.tagName.toLowerCase();
        for (const [name, value] of [...el.attributes]) {
          const named = attributeUrls(tag, name.toLowerCase(), value);
          if (named?.use !== "resource") {
            continue;
          }
          const inlined = named.urls.reduceRight((rewritten, { url, offset }) => {
            const uri = inlinedUri(url, deckDir, from);
            return uri === undefined
              ? rewritten
              : rewritten.slice(0, offset) + uri + rewritten.slice(offset + url.length);
          }, value);
          if (inlined !== value) {
            el.setAttribute(name, inlined);
          }
        }
      },
    })
    .transform(html);
  if (typeof output !== "string") {
    throw new Error("HTMLRewriter.transform expected a string");
  }
  return output;
}

/** A stylesheet with each local `url()` replaced by a data: URI; `from` is the directory the stylesheet lives in. */
export function inlineCssUrls(css: string, deckDir: string, from = deckDir): string {
  return replaceCssUrls(css, (url) => inlinedUri(url, deckDir, from));
}

/** The data: URI a local reference inlines to, keeping its fragment; none when it names no deck file. */
function inlinedUri(url: string, deckDir: string, from: string): string | undefined {
  const ref = classifyAssetRef(url, { deckDir, from });
  if (ref.kind !== "file") {
    return undefined;
  }
  const hash = url.indexOf("#");
  return `data:${mimeOf(ref.path)};base64,${readFileSync(ref.path).toString("base64")}${hash === -1 ? "" : url.slice(hash)}`;
}

/** The deck's stylesheet: theme.css, then each slide's own CSS scoped to that slide. */
export function readTheme(deckDir: string, minify: boolean): string {
  const path = join(deckDir, "theme.css");
  const theme = readDeckFile(deckDir, path) ?? "";
  const slidesDir = join(deckDir, "slides");
  const pieces = [
    minify ? inlineCssUrls(theme, deckDir) : theme,
    ...listSlideFiles(deckDir, ".css").map((slide) => {
      const scoped = scopeSlideCss(readFileSync(slide.path, "utf8"), slide.slug);
      return minify ? inlineCssUrls(scoped, deckDir, slidesDir) : scoped;
    }),
  ];
  const css = pieces.filter(Boolean).join("\n");
  if (!minify) {
    return css;
  }
  return minifyCss(css);
}

/** Media types by extension, for what a slide or a stylesheet commonly embeds. */
const MIME_TYPES: Readonly<Record<string, string>> = {
  ".apng": "image/apng",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".ogv": "video/ogg",
  ".webm": "video/webm",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".oga": "audio/ogg",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".wav": "audio/wav",
  ".eot": "application/vnd.ms-fontobject",
  ".otf": "font/otf",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".vtt": "text/vtt",
};

function mimeOf(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}
