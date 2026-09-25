import { join } from "node:path";
import { inlineAssets, inlineCssUrls, readTheme } from "./assets.ts";
import { playerChromeCss } from "./chrome.ts";
import { escapeAttr, escapeHtml } from "./escape.ts";
import { isInside } from "./path.ts";
import { type ProjectDeck, readDeckFile, requireSection } from "./resolve.ts";
import { FALLBACK_LANG } from "./schema.ts";
import { logicalSize } from "./size.ts";
import {
  loadSlideScripts,
  type SlideScriptEntry,
  stillPageScript,
  usableSlideScripts,
} from "./slide-script.ts";
import { stepKey, stepValuesForBeat } from "./step.ts";
import { skeletonHtml } from "./sync.ts";
import { attributeUrls, type UrlUse } from "./url-attributes.ts";

export { presenterSlides } from "./presenter.ts";
export { isUrlAttribute, srcsetUrls, type UrlUse } from "./url-attributes.ts";
export { inlineAssets, inlineCssUrls, readTheme };

export type PageMode = "player" | "presenter" | "video";

export function htmlShell(options: {
  lang?: string;
  title?: string;
  head?: string;
  body: string;
  bodyAttrs?: string;
}): string {
  const lang = escapeAttr(options.lang ?? FALLBACK_LANG);
  const title =
    options.title === undefined ? "" : `\n  <title>${escapeHtml(options.title)}</title>`;
  const head = options.head ? `\n  ${options.head}` : "";
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">${title}${head}
</head>
<body${options.bodyAttrs ?? ""}>
  ${options.body}
</body>
</html>
`;
}

function hasSlideClass(className: string | null | undefined): boolean {
  return (className ?? "").split(/\s+/).some((token) => token.toLowerCase() === "slide");
}

function isSlideOpenTag(openTag: string): boolean {
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

export function collectSlidesHtml(deck: ProjectDeck, options?: { inline?: boolean }): string {
  const parts = deck.deck.sections.map((section) =>
    slideWithSlug(slideSection(deck, section.slug), section.slug, deck, options),
  );
  return parts.join("");
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
  if (!isInside(path, join(deck.dir, "slides"))) {
    return undefined;
  }
  const source = readDeckFile(deck.dir, path);
  const extracted = source === undefined ? undefined : extractSlideSection(source);
  if (!extracted) {
    return undefined;
  }
  return slideWithSlug(extracted, slug, deck, options);
}

export function collectPrintSlidesHtml(deck: ProjectDeck): string {
  const parts: string[] = [];
  for (const section of deck.deck.sections) {
    const extracted = slideSection(deck, section.slug);
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
  return inlineAssets(parts.join(""), deck.dir);
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

/**
 * The slide's `<section>`, or the skeleton `dek sync` would write when the file is missing or
 * holds no slide. Lint reports those as DEK001 and DEK007; rendering never stops on them, because
 * at the venue a deck that shows beats one that does not.
 */
function slideSection(deck: ProjectDeck, slug: string): string {
  const path = slideHtmlPath(deck, slug);
  const source = readDeckFile(deck.dir, path);
  const extracted = source === undefined ? undefined : extractSlideSection(source);
  return extracted ?? extractSlideSection(skeletonHtml(deck.deck, slug) ?? "") ?? "";
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
  const extracted = slideSection(deck, slug);
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

function consumeTransform(output: unknown): void {
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
        `<li><a href="/decks/${escapeAttr(deck.name)}/">${escapeHtml(deck.name)} — ${escapeHtml(deck.title)}</a> · <a href="/decks/${escapeAttr(deck.name)}/presenter">presenter</a></li>`,
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

/** Where something is written: 1-based line, and 1-based column in UTF-16 units, as editors count. */
export type SourceSpot = { line: number; column: number };

/** One attribute as the parser read it, located at its name. */
export type HtmlAttribute = SourceSpot & { name: string; value: string };

/** One start tag, located at its `<`, with its attributes in source order. */
export type HtmlElement = SourceSpot & { tag: string; attributes: HtmlAttribute[] };

/** One URL an attribute names, located where the URL itself is written. */
export type HtmlRef = SourceSpot & { tag: string; attr: string; value: string; use: UrlUse };

export type HtmlScan = {
  /** Every start tag in the file, in document order. */
  elements: HtmlElement[];
  /** Every `<section class="slide">`; only the first is ever shown. */
  slides: HtmlElement[];
  slug?: string;
  /** The slide section's `data-layout`. */
  layout?: string;
  classes: string[];
  /** Every URL the markup names, a `srcset` candidate apiece. */
  refs: HtmlRef[];
  /** Headings with nothing to read: no text, no image, no `aria-label`. */
  emptyHeadings: HtmlElement[];
};

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
/** Elements that give a heading something to show without any text. */
const CONTENT_TAGS = new Set(["img", "svg", "picture", "video", "canvas", "object", "math"]);

/**
 * What a slide's markup uses and references, read in one pass of the real parser and located in
 * the source. The parser has no positions, so each start tag gets a marker in front of it; where
 * the markers land, less their own length, is where the tags were written.
 */
export function scanSlideHtml(html: string): HtmlScan {
  const mark = uniqueMark(html);
  const parsed: Array<{ tag: string; attributes: Array<[string, string]> }> = [];
  const headings: Array<{ index: number; content: boolean }> = [];
  const open: Array<{ index: number; content: boolean }> = [];

  const transformed = new HTMLRewriter()
    .on("*", {
      element(el) {
        el.before(mark, { html: true });
        const tag = el.tagName.toLowerCase();
        const attributes = [...el.attributes].map(([name, value]): [string, string] => [
          name.toLowerCase(),
          value,
        ]);
        if (CONTENT_TAGS.has(tag)) {
          for (const heading of open) {
            heading.content = true;
          }
        }
        if (HEADING_TAGS.has(tag) && el.canHaveContent) {
          const heading = {
            index: parsed.length,
            content: (el.getAttribute("aria-label") ?? "").trim() !== "",
          };
          headings.push(heading);
          open.push(heading);
          el.onEndTag(() => {
            open.splice(open.indexOf(heading), 1);
          });
        }
        parsed.push({ tag, attributes });
      },
    })
    .onDocument({
      text(chunk) {
        if (open.length > 0 && chunk.text.trim() !== "") {
          for (const heading of open) {
            heading.content = true;
          }
        }
      },
    })
    .transform(html);
  if (typeof transformed !== "string") {
    consumeTransform(transformed);
    throw new Error("HTMLRewriter.transform expected a string");
  }

  const spot = spotter(html);
  const elements: HtmlElement[] = [];
  const refs: HtmlRef[] = [];
  let start = 0;
  for (const [index, before] of transformed.split(mark).slice(0, -1).entries()) {
    start += before.length;
    const { tag, attributes } = parsed[index] ?? { tag: "", attributes: [] };
    const offsets = attributeOffsets(html, start);
    const element: HtmlElement = {
      tag,
      ...spot(start),
      attributes: attributes.map(([name, value]) => ({
        name,
        value,
        ...spot(offsets.get(name)?.name ?? start),
      })),
    };
    elements.push(element);
    for (const attribute of element.attributes) {
      const valueAt = offsets.get(attribute.name)?.value;
      refs.push(
        ...attributeRefs(element.tag, attribute).map(({ ref, offset }) => ({
          ...ref,
          ...(valueAt === undefined ? spot(start) : spot(valueAt + offset)),
        })),
      );
    }
  }

  const slides = elements.filter(
    (element) => element.tag === "section" && hasSlideClass(attributeValue(element, "class")),
  );
  const slug = slides.map((element) => attributeValue(element, "data-slug")).find(isDefined);
  const layout = slides[0] && attributeValue(slides[0], "data-layout");
  return {
    elements,
    slides,
    ...(slug === undefined ? {} : { slug }),
    ...(layout === undefined ? {} : { layout }),
    classes: elements.flatMap((element) =>
      (attributeValue(element, "class") ?? "").split(/\s+/).filter(Boolean),
    ),
    refs,
    emptyHeadings: headings
      .filter((heading) => !heading.content)
      .flatMap((heading) => elements[heading.index] ?? []),
  };
}

/** The value of `name` on `element`, as the parser read it. */
export function attributeValue(element: HtmlElement, name: string): string | undefined {
  return element.attributes.find((attribute) => attribute.name === name)?.value;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

/** The URLs one attribute names, each with its offset into the value. */
function attributeRefs(
  tag: string,
  attribute: HtmlAttribute,
): Array<{ ref: Omit<HtmlRef, keyof SourceSpot>; offset: number }> {
  const named = attributeUrls(tag, attribute.name, attribute.value);
  if (!named) {
    return [];
  }
  return named.urls.map(({ url, offset }) => ({
    ref: { tag, attr: attribute.name, value: url, use: named.use },
    offset,
  }));
}

/**
 * Where each attribute of the start tag at `start` is written: its name, and its value when it
 * has one. Only positions come from here; names and values are the parser's.
 */
function attributeOffsets(
  html: string,
  start: number,
): Map<string, { name: number; value?: number }> {
  const offsets = new Map<string, { name: number; value?: number }>();
  const re = /\s*(?:([^\s"'>/=]+)(?:(\s*=\s*)(["']?))?|\/)/y;
  re.lastIndex = start + 1 + (html.slice(start + 1).match(/^[^\s/>]*/)?.[0].length ?? 0);
  while (re.lastIndex < html.length && html[re.lastIndex] !== ">") {
    const at = re.lastIndex;
    const match = re.exec(html);
    if (!match || match[0].length === 0) {
      break;
    }
    const [whole, attr, equals, quote] = match;
    if (attr === undefined) {
      continue;
    }
    const nameAt = at + whole.indexOf(attr);
    let valueAt: number | undefined;
    if (equals !== undefined) {
      valueAt = nameAt + attr.length + equals.length + (quote ? 1 : 0);
      const end = quote
        ? html.indexOf(quote, valueAt)
        : valueAt + Math.max(0, html.slice(valueAt).search(/[\s>]/));
      re.lastIndex = end === -1 ? html.length : quote ? end + 1 : end;
    }
    const key = attr.toLowerCase();
    if (!offsets.has(key)) {
      offsets.set(key, valueAt === undefined ? { name: nameAt } : { name: nameAt, value: valueAt });
    }
  }
  return offsets;
}

/** A marker the file does not contain, so splitting on it finds only the ones the scan inserted. */
function uniqueMark(html: string): string {
  let mark = "\u{F8FF}";
  while (html.includes(mark)) {
    mark += "\u{F8FF}";
  }
  return mark;
}

/** Turns an offset into `source` into the line and column an editor shows. */
function spotter(source: string): (offset: number) => SourceSpot {
  const starts = [0];
  for (let index = source.indexOf("\n"); index !== -1; index = source.indexOf("\n", index + 1)) {
    starts.push(index + 1);
  }
  return (offset) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if ((starts[mid] ?? 0) <= offset) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return { line: low + 1, column: offset - (starts[low] ?? 0) + 1 };
  };
}
