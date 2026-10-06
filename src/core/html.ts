import { cutText } from "./annotation-rows.ts";
import { assetInliner } from "./assets.ts";
import { deckPaths } from "./deck-paths.ts";
import { escapeAttr, escapeHtml } from "./escape.ts";
import { type LineColumn, lineLocator } from "./lines.ts";
import { isInside } from "./path.ts";
import { type ProjectDeck, readDeckFile } from "./resolve.ts";
import { FALLBACK_LANG, type Section } from "./schema.ts";
import { deckLayouts, type SkeletonLayouts, skeletonHtml } from "./skeleton.ts";

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

export function hasSlideClass(className: string | null | undefined): boolean {
  return (className ?? "").split(/\s+/).some((token) => token.toLowerCase() === "slide");
}

/**
 * The first `<section class="slide">`, as written, read by the same parser the lint scan uses: a
 * slide inside a comment or a `data-class` attribute is not one. A marker goes before its start
 * tag and after its end tag; where the markers land, less their own length, is where it was
 * written. A slide that never closes runs to `</body>`, or to the end.
 */
export function extractSlideSection(html: string): string | undefined {
  return locateSlideSection(html)?.section;
}

/** The first slide section, as `extractSlideSection` reads it, and the offset it starts at. */
function locateSlideSection(html: string): { section: string; start: number } | undefined {
  const mark = uniqueMark(html);
  let found = false;
  let closed = false;
  const marked = rewriteHtml(html, (rewriter) => {
    rewriter.on("section", {
      element(el) {
        if (found || !hasSlideClass(el.getAttribute("class"))) {
          return;
        }
        found = true;
        el.before(mark, { html: true });
        el.onEndTag((end) => {
          closed = true;
          end.after(mark, { html: true });
        });
      },
    });
  });
  if (!found) {
    return undefined;
  }
  const start = marked.indexOf(mark);
  const slide = closed
    ? html.slice(start, marked.indexOf(mark, start + mark.length) - mark.length)
    : undefined;
  // The parser closes an unclosed slide at the end of its parent, past `</body>`.
  if (slide !== undefined && /<\/section\s*>$/i.test(slide)) {
    return { section: slide, start };
  }
  const bodyClose = html.slice(start).search(/<\/body>/i);
  return {
    section: bodyClose >= 0 ? html.slice(start, start + bodyClose) : html.slice(start),
    start,
  };
}

/** A deck's slide markup, each file read at most once. */
export type DeckSlides = {
  /** Whether `slides/<slug>.html` holds a slide section. */
  has(slug: string): boolean;
  /** The slide section as `slides/<slug>.html` writes it, or undefined when it holds none. */
  written(slug: string): string | undefined;
  /**
   * The slide section to show: the written one, or the skeleton `dekc sync` would write when the
   * file is missing or holds no slide. Lint reports those as DEK001 and DEK007; rendering never
   * stops on them, because at the venue a deck that shows beats one that does not.
   */
  section(slug: string): string;
  /** Where the written section is in `slides/<slug>.html`; none for a skeleton. */
  source(slug: string): SlideSource | undefined;
};

/** A slide file and the offset its section starts at: the section is `file` from `start`. */
type SlideSource = { file: string; start: number };

export function deckSlides(deck: ProjectDeck): DeckSlides {
  const paths = deckPaths(deck.dir);
  const read = new Map<string, (SlideSource & { section: string }) | undefined>();
  let layouts: SkeletonLayouts | undefined;
  const skeleton = (slug: string): string | undefined => {
    layouts ??= deckLayouts(deck.dir);
    return skeletonHtml(deck.deck, slug, layouts);
  };
  const located = (slug: string): (SlideSource & { section: string }) | undefined => {
    if (!read.has(slug)) {
      const path = paths.slide(slug, ".html");
      // A slug from a URL may try to climb out of slides/.
      const file =
        isSafeSlideSlug(slug) && isInside(path, paths.slides)
          ? readDeckFile(deck.dir, path)
          : undefined;
      const found = file === undefined ? undefined : locateSlideSection(file);
      read.set(slug, file !== undefined && found ? { file, ...found } : undefined);
    }
    return read.get(slug);
  };
  const written = (slug: string): string | undefined => located(slug)?.section;
  return {
    has: (slug) => written(slug) !== undefined,
    written,
    section: (slug) => written(slug) ?? extractSlideSection(skeleton(slug) ?? "") ?? "",
    source(slug) {
      const found = located(slug);
      return found && { file: found.file, start: found.start };
    },
  };
}

function isSafeSlideSlug(slug: string): boolean {
  return slug.length > 0 && !slug.includes("/") && !slug.includes("\\") && !slug.includes("\0");
}

/**
 * Where the script puts a slide: its 1-based number and how many slides the deck has. Every
 * page shows it the same, so a theme can print a folio that follows the script's order.
 */
export type SlidePlace = { number: number; count: number };

/** The place of the script's `index`-th section. */
export function slidePlace(sections: readonly Section[], index: number): SlidePlace {
  return { number: index + 1, count: sections.length };
}

/** What a slide's section carries on a page; everything but the slug and place is for still pages. */
export type SlideStamp = {
  slug: string;
  place: SlidePlace;
  /** The `data-step` values shown; the slide is the current one, as the player would mark it. */
  shown?: Set<string>;
  /** The beat a still page shows, for its `stillDrawScript`. */
  beat?: { index: number; step: string };
  /** Inline the deck's files as data: URIs, for a page that stands alone. */
  inline?: { deckDir: string };
  /**
   * Where the section is written, for the dev server's pages: every start tag then says where
   * in the file it is, as `data-dek-source="<line>:<column>"`, and the classes it is written
   * with, as `data-dek-class`, so annotate mode can name it as the file does whatever a script
   * adds to it.
   */
  source?: SlideSource;
};

/**
 * One slide section with what the page needs on it, in one parser pass: its `data-slug` unless
 * it names its own, its place as `--dek-slide-number` and `--dek-slide-count`, for a still page
 * the classes and beat the player would have set, and for the dev server where each tag is
 * written.
 */
export function stampSlide(html: string, stamp: SlideStamp): string {
  let done = false;
  const spots = stamp.source && startTagSpots(html, stamp.source);
  return rewriteHtml(html, (rewriter) => {
    rewriter.on("section", {
      element(el) {
        if (done || !hasSlideClass(el.getAttribute("class"))) {
          return;
        }
        done = true;
        if (el.getAttribute("data-slug") === null) {
          el.setAttribute("data-slug", stamp.slug);
        }
        // Ahead of the author's own style, so a slide can still set its own.
        const place = `--dek-slide-number: ${stamp.place.number}; --dek-slide-count: ${stamp.place.count}`;
        const own = el.getAttribute("style")?.trim();
        el.setAttribute("style", own ? `${place}; ${own}` : place);
        if (stamp.shown) {
          addClass(el, "is-current");
        }
        if (stamp.beat) {
          el.setAttribute("data-dek-beat", String(stamp.beat.index));
          el.setAttribute("data-dek-step", stamp.beat.step);
        }
      },
    });
    const { shown } = stamp;
    if (shown) {
      rewriter.on("[data-step]", {
        element(el) {
          const step = el.getAttribute("data-step");
          if (step !== null && shown.has(step)) {
            addClass(el, "is-shown");
          }
        },
      });
    }
    if (stamp.inline) {
      rewriter.on("*", assetInliner(stamp.inline.deckDir));
    }
    if (spots) {
      // The same parser over the same markup meets the start tags in the same order.
      let index = 0;
      rewriter.on("*", {
        element(el) {
          const spot = spots[index++];
          if (spot) {
            el.setAttribute("data-dek-source", `${spot.line}:${spot.column}`);
            if (spot.classes !== undefined) {
              el.setAttribute("data-dek-class", spot.classes);
            }
          }
        },
      });
    }
  });
}

/**
 * Where a start tag is written, its tag, its classes as written (none when it has no `class`),
 * and the text inside it as written, whitespace collapsed.
 */
type TagSpot = LineColumn & { tag: string; classes?: string; text: string };

/**
 * Where each start tag of `html` is written in the file it was taken from, in document order,
 * read before anything else touches the markup. A marker goes in front of each tag; where the
 * markers land, less their own length, is where the tags were.
 */
function startTagSpots(html: string, source: SlideSource): TagSpot[] {
  const mark = uniqueMark(html);
  const tags: Array<{ tag: string; classes: string | null; text: string }> = [];
  const open: number[] = [];
  const marked = rewriteHtml(html, (rewriter) => {
    rewriter.on("*", {
      element(el) {
        el.before(mark, { html: true });
        const index = tags.length;
        tags.push({ tag: el.tagName.toLowerCase(), classes: el.getAttribute("class"), text: "" });
        if (el.canHaveContent) {
          open.push(index);
          el.onEndTag(() => {
            open.splice(open.lastIndexOf(index), 1);
          });
        }
      },
    });
    rewriter.onDocument({
      text(chunk) {
        for (const index of open) {
          const tag = tags[index];
          if (tag) {
            tag.text += chunk.text;
          }
        }
      },
    });
  });
  const spot = lineLocator(source.file);
  let offset = source.start;
  return marked
    .split(mark)
    .slice(0, -1)
    .map((before, index) => {
      offset += before.length;
      const { tag = "", classes = null, text = "" } = tags[index] ?? {};
      const found = { ...spot(offset), tag, text: text.replace(/\s+/g, " ").trim() };
      return classes === null
        ? found
        : { ...found, classes: classes.split(/\s+/).filter(Boolean).join(" ") };
    });
}

/**
 * An element of a written slide as annotate mode names it, whatever a script adds to it: where
 * its start tag is written, `<line>:<column>`, its tag and classes as written, as `div.chevron`,
 * and its text as written, cut short. The slide itself has no text: all of the slide names
 * nothing.
 */
export type WrittenElement = { source: string; name: string; text: string };

/** Every element of the slide `slides/<slug>.html` writes, in document order; none for a skeleton. */
export function writtenElements(slides: DeckSlides, slug: string): WrittenElement[] | undefined {
  const html = slides.written(slug);
  const source = slides.source(slug);
  if (html === undefined || source === undefined) {
    return undefined;
  }
  return startTagSpots(html, source).map((spot, index) => ({
    source: `${spot.line}:${spot.column}`,
    name: [spot.tag, ...(spot.classes ?? "").split(" ").filter(Boolean)].join("."),
    text: index === 0 ? "" : cutText(spot.text),
  }));
}

/**
 * Every slide of the deck in script order, as the player pages hold them. `sources` says where
 * each tag is written, for the dev server's pages.
 */
export function collectSlidesHtml(
  deck: ProjectDeck,
  options: { inline: boolean; sources?: boolean },
): string {
  const slides = deckSlides(deck);
  const { sections } = deck.deck;
  return sections
    .map((section, index) => {
      const source = options.sources ? slides.source(section.slug) : undefined;
      return stampSlide(slides.section(section.slug), {
        slug: section.slug,
        place: slidePlace(sections, index),
        ...(options.inline ? { inline: { deckDir: deck.dir } } : {}),
        ...(source ? { source } : {}),
      });
    })
    .join("");
}

function addClass(el: HTMLRewriterTypes.Element, className: string): void {
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
  if (typeof output !== "string") {
    throw new Error("HTMLRewriter.transform expected a string");
  }
  return output;
}

/** A marker the file does not contain, so splitting on it finds only the ones inserted. */
export function uniqueMark(html: string): string {
  let mark = "\u{F8FF}";
  while (html.includes(mark)) {
    mark += "\u{F8FF}";
  }
  return mark;
}
