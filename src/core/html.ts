import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { playerChromeCss } from "./chrome.ts";
import type { DekConfig } from "./config.ts";
import { DekError } from "./error.ts";
import { escapeAttr, escapeHtml } from "./escape.ts";
import { isInside } from "./path.ts";
import type { PresenterSlide } from "./presenter.ts";
import type { ProjectDeck } from "./resolve.ts";
import { logicalSize } from "./size.ts";
import { stepValuesForBeat } from "./step.ts";
import { formatSectionScript, sectionTiming } from "./timing.ts";

export type PageMode = "player" | "presenter" | "video";

export function isSlideOpenTag(openTag: string): boolean {
  return classTokens(openTag).some((token) => token.toLowerCase() === "slide");
}

export function extractSlideSection(html: string): string | undefined {
  const openRe = /<section\b[^>]*>/gi;
  let open = openRe.exec(html);
  while (open) {
    if (!isSlideOpenTag(open[0])) {
      open = openRe.exec(html);
      continue;
    }
    const start = open.index;
    const afterOpen = start + open[0].length;
    const tagRe = /<\/?section\b[^>]*>/gi;
    tagRe.lastIndex = afterOpen;
    let depth = 1;
    let found = tagRe.exec(html);
    while (found) {
      if (found[0].startsWith("</")) {
        depth--;
        if (depth === 0) {
          return html.slice(start, found.index + found[0].length);
        }
      } else {
        depth++;
      }
      found = tagRe.exec(html);
    }
    const fromOpen = html.slice(afterOpen);
    const bodyClose = fromOpen.search(/<\/body>/i);
    if (bodyClose >= 0) {
      return html.slice(start, afterOpen + bodyClose);
    }
    return html.slice(start);
  }
  return undefined;
}

function classTokens(openTag: string): string[] {
  const quoted = openTag.match(/\bclass\s*=\s*(["'])([^"']*)\1/i);
  if (quoted?.[2] !== undefined) {
    return quoted[2].trim().split(/\s+/).filter(Boolean);
  }
  const unquoted = openTag.match(/\bclass\s*=\s*([^\s>]+)/i);
  return unquoted?.[1] ? [unquoted[1]] : [];
}

export function injectSlug(section: string, slug: string): string {
  let done = false;
  return rewriteHtml(section, (rewriter) => {
    rewriter.on("section", {
      element(el) {
        if (done) {
          return;
        }
        done = true;
        if (el.getAttribute("data-slug") !== null) {
          return;
        }
        el.setAttribute("data-slug", slug);
      },
    });
  });
}

export function minifyFragments(html: string): string {
  return html.replace(/>\s+</g, "><");
}

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

export function presenterSlides(deck: ProjectDeck, config: DekConfig): PresenterSlide[] {
  const timing = sectionTiming(deck.deck.sections, deck.deck.duration, config);
  const budgetBySlug = new Map(timing.map((row) => [row.slug, row.budgetSeconds]));
  return deck.deck.sections.map((section) => ({
    slug: section.slug,
    title: section.title,
    script: formatSectionScript(section),
    beats: section.beats.map((beat) => ({ id: beat.id, title: beat.title })),
    ...(budgetBySlug.get(section.slug) !== undefined
      ? { budgetSeconds: budgetBySlug.get(section.slug) }
      : {}),
  }));
}

export function collectSlidesHtml(
  deck: ProjectDeck,
  options?: { inline?: boolean; requireAll?: boolean },
): string {
  const parts: string[] = [];
  for (const section of deck.deck.sections) {
    if (options?.requireAll) {
      let html = injectSlug(requireSlideSection(deck, section.slug), section.slug);
      if (options.inline) {
        html = inlineAssets(html, deck.dir);
      }
      parts.push(html);
      continue;
    }
    parts.push(slideFragment(deck, section.slug, options) ?? missingSlidePlaceholder(section.slug));
  }
  return minifyFragments(parts.join(""));
}

export function missingSlidePlaceholder(slug: string): string {
  return `<section class="slide" data-slug="${escapeAttr(slug)}" data-missing></section>`;
}

export function slideFragment(
  deck: ProjectDeck,
  slug: string,
  options?: { inline?: boolean },
): string | undefined {
  if (!isSafeSlideSlug(slug)) {
    return undefined;
  }
  const path = slideHtmlPath(deck, slug);
  if (!isInside(path, join(deck.dir, "slides")) || !existsSync(path)) {
    return undefined;
  }
  const extracted = extractSlideSection(readFileSync(path, "utf8"));
  if (!extracted) {
    return undefined;
  }
  let html = injectSlug(extracted, slug);
  if (options?.inline) {
    html = inlineAssets(html, deck.dir);
  }
  return html;
}

export function collectPrintSlidesHtml(deck: ProjectDeck): string {
  const parts: string[] = [];
  for (const section of deck.deck.sections) {
    const extracted = requireSlideSection(deck, section.slug);
    const last = Math.max(section.beats.length - 1, 0);
    const shown = stepValuesForBeat(
      section.beats.map((beat) => ({ id: beat.id })),
      last,
    );
    parts.push(applyShownClasses(injectSlug(extracted, section.slug), shown));
  }
  return inlineAssets(minifyFragments(parts.join("")), deck.dir);
}

function slideHtmlPath(deck: ProjectDeck, slug: string): string {
  return join(deck.dir, "slides", `${slug}.html`);
}

function requireSlideSection(deck: ProjectDeck, slug: string): string {
  const path = slideHtmlPath(deck, slug);
  if (!existsSync(path)) {
    throw new DekError(`missing slide HTML for "${slug}"`, {
      path,
      hint: "run `dek sync` to create the skeleton",
    });
  }
  const extracted = extractSlideSection(readFileSync(path, "utf8"));
  if (!extracted) {
    throw new DekError(`slide HTML has no section "${slug}"`, {
      path,
      hint: "run `dek sync` to create the skeleton",
    });
  }
  return extracted;
}

export function renderSlideHtml(deck: ProjectDeck, slug: string, beatIndex: number): string {
  const section = deck.deck.sections.find((entry) => entry.slug === slug);
  if (!section) {
    throw new DekError(`section "${slug}" not found`, {
      path: deck.scriptPath,
      hint: "run `dek ls`",
    });
  }
  const extracted = requireSlideSection(deck, slug);
  const shown = stepValuesForBeat(
    section.beats.map((beat) => ({ id: beat.id })),
    beatIndex,
  );
  const slide = inlineAssets(applyShownClasses(injectSlug(extracted, slug), shown), deck.dir);
  const themeCss = readTheme(deck.dir, false);
  const size = logicalSize(deck.deck.ratio);
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <style>${playerChromeCss(size)}</style>
  <style>${themeCss}</style>
</head>
<body>
  <div id="deck">${slide}</div>
</body>
</html>
`;
}

export function applyShownClasses(html: string, shown: Set<string>): string {
  let current = false;
  return rewriteHtml(html, (rewriter) => {
    rewriter.on("section", {
      element(el) {
        if (current) {
          return;
        }
        const className = el.getAttribute("class") ?? "";
        if (!className.split(/\s+/).some((token) => token.toLowerCase() === "slide")) {
          return;
        }
        current = true;
        addClassAttr(el, "is-current");
      },
    });
    rewriter.on("[data-step]", {
      element(el) {
        const step = el.getAttribute("data-step");
        if (step !== null && shown.has(step)) {
          addClassAttr(el, "is-shown");
        }
      },
    });
  });
}

function addClassAttr(
  el: {
    getAttribute(name: string): string | null;
    setAttribute(name: string, value: string): void;
  },
  className: string,
): void {
  const current = el.getAttribute("class");
  const tokens = current ? current.split(/\s+/).filter(Boolean) : [];
  if (tokens.includes(className)) {
    return;
  }
  tokens.push(className);
  el.setAttribute("class", tokens.join(" "));
}

function rewriteHtml(html: string, configure: (rewriter: HTMLRewriter) => void): string {
  const rewriter = new HTMLRewriter();
  configure(rewriter);
  const output = rewriter.transform(html);
  if (typeof output === "string") {
    return output;
  }
  consumeTransform(output);
  throw new Error("HTMLRewriter.transform expected a string");
}

export function consumeTransform(output: unknown): void {
  if (output !== null && typeof output === "object" && "arrayBuffer" in output) {
    void (output as Response).arrayBuffer();
  }
}

export function renderIndexHtml(
  decks: Array<{ name: string; title: string }>,
  failed: Array<{ name: string }> = [],
): string {
  const items = decks
    .map(
      (deck) =>
        `<li><a href="/decks/${escapeAttr(deck.name)}/">${escapeHtml(deck.name)} — ${escapeHtml(deck.title)}</a></li>`,
    )
    .join("");
  const failedItems = failed.map((entry) => `<li>${escapeHtml(entry.name)}</li>`).join("");
  const failedBlock = failed.length > 0 ? `<h2>failed</h2><ul>${failedItems}</ul>` : "";
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>dek</title>
</head>
<body>
  <h1>decks</h1>
  <ul>${items}</ul>
  ${failedBlock}
</body>
</html>
`;
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

export function readTheme(deckDir: string, minify: boolean): string {
  const path = join(deckDir, "theme.css");
  if (!existsSync(path)) {
    return "";
  }
  const css = readFileSync(path, "utf8");
  if (!minify) {
    return css;
  }
  return inlineCssUrls(css, deckDir)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isSafeSlideSlug(slug: string): boolean {
  return slug.length > 0 && !slug.includes("/") && !slug.includes("\\") && !slug.includes("\0");
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
