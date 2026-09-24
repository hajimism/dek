import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { scopeSlideCss } from "./css.ts";
import { isInside } from "./path.ts";
import { listSlideFiles } from "./resolve.ts";

export function inlineAssets(html: string, deckDir: string): string {
  return html.replace(/\bsrc=(["'])([^"']+)\1/gi, (match, quote: string, src: string) => {
    if (src.startsWith("data:") || /^(https?:)?\/\//i.test(src)) {
      return match;
    }
    const file = resolveAsset(src, deckDir);
    if (!file) {
      return match;
    }
    const bytes = readFileSync(file);
    return `src=${quote}data:${mimeOf(file)};base64,${bytes.toString("base64")}${quote}`;
  });
}

export function inlineCssUrls(css: string, deckDir: string): string {
  return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (match, _quote: string, src: string) => {
    const href = src.trim();
    if (!href || href.startsWith("data:") || /^(https?:)?\/\//i.test(href)) {
      return match;
    }
    const file = resolveAsset(href, deckDir);
    if (!file) {
      return match;
    }
    const bytes = readFileSync(file);
    return `url("data:${mimeOf(file)};base64,${bytes.toString("base64")}")`;
  });
}

/** The deck's stylesheet: theme.css, then each slide's own CSS scoped to that slide. */
export function readTheme(deckDir: string, minify: boolean): string {
  const path = join(deckDir, "theme.css");
  const theme = existsSync(path) ? readFileSync(path, "utf8") : "";
  const css = [
    theme,
    ...listSlideFiles(deckDir, ".css").map((slide) =>
      scopeSlideCss(readFileSync(slide.path, "utf8"), slide.slug),
    ),
  ]
    .filter(Boolean)
    .join("\n");
  if (!minify) {
    return css;
  }
  return inlineCssUrls(css, deckDir)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveAsset(src: string, deckDir: string): string | undefined {
  const candidates = [join(deckDir, src), join(deckDir, "slides", src)];
  return candidates.find(
    (path) => existsSync(path) && statSync(path).isFile() && isInside(path, deckDir),
  );
}

function mimeOf(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    case ".webp":
      return "image/webp";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    case ".ttf":
      return "font/ttf";
    case ".otf":
      return "font/otf";
    default:
      return "application/octet-stream";
  }
}
