import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { inlineAssets, inlineCssUrls, readTheme } from "./assets.ts";
import { playerChromeCss } from "./chrome.ts";
import { DekError } from "./error.ts";
import { escapeAttr, escapeHtml } from "./escape.ts";
import { isInside } from "./path.ts";
import { type ProjectDeck, requireSection } from "./resolve.ts";
import { DEFAULT_LANG } from "./schema.ts";
import { logicalSize } from "./size.ts";
import {
  loadSlideScripts,
  type SlideScriptEntry,
  stillPageScript,
  usableSlideScripts,
} from "./slide-script.ts";
import { stepKey, stepValuesForBeat } from "./step.ts";

export { presenterSlides } from "./presenter.ts";
export { inlineAssets, inlineCssUrls, readTheme };

export type PageMode = "player" | "presenter" | "video";

export function htmlShell(options: {
  lang?: string;
  title?: string;
  head?: string;
  body: string;
  bodyAttrs?: string;
}): string {
  const lang = escapeAttr(options.lang ?? DEFAULT_LANG);
  const title =
    options.title === undefined ? "" : `\n  <title>${escapeHtml(options.title)}</title>`;
  const head = options.head ? `\n  ${options.head}` : "";
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">${title}${head}
</head>
<body${options.bodyAttrs ?? ""}>
  ${options.body}
</body>
</html>
`;
}

export function hasSlideClass(className: string | null | undefined): boolean {
  return (className ?? "").split(/\s+/).some((token) => token.toLowerCase() === "slide");
}

export function isSlideOpenTag(openTag: string): boolean {
  return hasSlideClass(classTokens(openTag).join(" "));
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

/** Elements whose whitespace is content, so the build must keep it byte for byte. */
const PRESERVED_WHITESPACE = /<(pre|textarea)\b[\s\S]*?<\/\1\s*>/gi;

/**
 * Collapses whitespace between tags to one space, which is how the browser renders it
 * outside `pre`, so the build looks like the dev server; `pre` and `textarea` stay as written.
 */
export function minifyFragments(html: string): string {
  // A slice's ends sit against a preserved element, so they count as tag edges too.
  const collapse = (part: string): string => part.replace(/(^|>)\s+(?=<|$)/g, "$1 ");
  let out = "";
  let last = 0;
  for (const match of html.matchAll(PRESERVED_WHITESPACE)) {
    out += collapse(html.slice(last, match.index)) + match[0];
    last = match.index + match[0].length;
  }
  return out + collapse(html.slice(last));
}

export function collectSlidesHtml(
  deck: ProjectDeck,
  options?: { inline?: boolean; requireAll?: boolean },
): string {
  const parts: string[] = [];
  for (const section of deck.deck.sections) {
    if (options?.requireAll) {
      parts.push(
        slideWithSlug(requireSlideSection(deck, section.slug), section.slug, deck, options),
      );
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
  return slideWithSlug(extracted, slug, deck, options);
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
    parts.push(
      markBeat(
        applyShownClasses(slideWithSlug(extracted, section.slug, deck), shown),
        last,
        stepKey(section.beats, last),
      ),
    );
  }
  return inlineAssets(minifyFragments(parts.join("")), deck.dir);
}

function slideWithSlug(
  extracted: string,
  slug: string,
  deck: ProjectDeck,
  options?: { inline?: boolean },
): string {
  const html = injectSlug(extracted, slug);
  return options?.inline ? inlineAssets(html, deck.dir) : html;
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

export type SlideSources = {
  themeCss: string;
  fragments: Map<string, string>;
  scripts: SlideScriptEntry[];
  /** Whether a broken slide script fails its page (shots) or is skipped (visual lint). */
  strict: boolean;
};

/** What a run of still pages shares, read once instead of once per page. */
export function loadSlideSources(
  deck: ProjectDeck,
  options: { strict?: boolean } = {},
): SlideSources {
  return {
    themeCss: readTheme(deck.dir, false),
    fragments: new Map(),
    scripts: loadSlideScripts(deck.dir),
    strict: options.strict ?? true,
  };
}

export function renderSlideHtml(
  deck: ProjectDeck,
  slug: string,
  beatIndex: number,
  sources?: SlideSources,
): string {
  const section = requireSection(deck, slug);
  const extracted = fragmentFor(deck, slug, sources);
  const shown = stepValuesForBeat(
    section.beats.map((beat) => ({ id: beat.id })),
    beatIndex,
  );
  const slide = inlineAssets(
    markBeat(
      applyShownClasses(slideWithSlug(extracted, slug, deck), shown),
      beatIndex,
      stepKey(section.beats, beatIndex),
    ),
    deck.dir,
  );
  const themeCss = sources?.themeCss ?? readTheme(deck.dir, false);
  const scripts = usableSlideScripts(
    (sources?.scripts ?? loadSlideScripts(deck.dir, slug)).filter((entry) => entry.slug === slug),
    sources?.strict ?? true,
  );
  const size = logicalSize(deck.deck.ratio);
  return htmlShell({
    lang: deck.deck.lang,
    head: `<style>${playerChromeCss(size)}</style>
  <style>${themeCss}</style>`,
    body: `<div id="deck">${slide}</div>
  ${stillPageScript(scripts)}`,
  });
}

/** Tells the still page's `stillDrawScript` which beat it shows. */
function markBeat(html: string, index: number, step: string): string {
  let done = false;
  return rewriteHtml(html, (rewriter) => {
    rewriter.on("section", {
      element(el) {
        if (done || !hasSlideClass(el.getAttribute("class"))) {
          return;
        }
        done = true;
        el.setAttribute("data-dek-beat", String(index));
        el.setAttribute("data-dek-step", step);
      },
    });
  });
}

function fragmentFor(deck: ProjectDeck, slug: string, sources?: SlideSources): string {
  const cached = sources?.fragments.get(slug);
  if (cached !== undefined) {
    return cached;
  }
  const extracted = requireSlideSection(deck, slug);
  sources?.fragments.set(slug, extracted);
  return extracted;
}

export function applyShownClasses(html: string, shown: Set<string>): string {
  let current = false;
  return rewriteHtml(html, (rewriter) => {
    rewriter.on("section", {
      element(el) {
        if (current) {
          return;
        }
        if (!hasSlideClass(el.getAttribute("class"))) {
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
  return htmlShell({
    title: "dek",
    body: `<h1>decks</h1>
  <ul>${items}</ul>
  ${failedBlock}`,
  });
}

function isSafeSlideSlug(slug: string): boolean {
  return slug.length > 0 && !slug.includes("/") && !slug.includes("\\") && !slug.includes("\0");
}
