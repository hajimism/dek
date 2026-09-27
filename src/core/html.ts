import { assetInliner } from "./assets.ts";
import { deckPaths } from "./deck-paths.ts";
import { escapeAttr, escapeHtml } from "./escape.ts";
import { isInside } from "./path.ts";
import { type ProjectDeck, readDeckFile } from "./resolve.ts";
import { FALLBACK_LANG } from "./schema.ts";
import { skeletonHtml } from "./skeleton.ts";

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
    return slide;
  }
  const bodyClose = html.slice(start).search(/<\/body>/i);
  return bodyClose >= 0 ? html.slice(start, start + bodyClose) : html.slice(start);
}

/** A deck's slide markup, each file read at most once. */
export type DeckSlides = {
  /** Whether `slides/<slug>.html` holds a slide section. */
  has(slug: string): boolean;
  /** The slide section as `slides/<slug>.html` writes it, or undefined when it holds none. */
  written(slug: string): string | undefined;
  /**
   * The slide section to show: the written one, or the skeleton `dek sync` would write when the
   * file is missing or holds no slide. Lint reports those as DEK001 and DEK007; rendering never
   * stops on them, because at the venue a deck that shows beats one that does not.
   */
  section(slug: string): string;
};

export function deckSlides(deck: ProjectDeck): DeckSlides {
  const paths = deckPaths(deck.dir);
  const read = new Map<string, string | undefined>();
  const written = (slug: string): string | undefined => {
    if (!read.has(slug)) {
      const path = paths.slide(slug, ".html");
      // A slug from a URL may try to climb out of slides/.
      const source =
        isSafeSlideSlug(slug) && isInside(path, paths.slides)
          ? readDeckFile(deck.dir, path)
          : undefined;
      read.set(slug, source === undefined ? undefined : extractSlideSection(source));
    }
    return read.get(slug);
  };
  return {
    has: (slug) => written(slug) !== undefined,
    written,
    section: (slug) =>
      written(slug) ?? extractSlideSection(skeletonHtml(deck.deck, slug) ?? "") ?? "",
  };
}

function isSafeSlideSlug(slug: string): boolean {
  return slug.length > 0 && !slug.includes("/") && !slug.includes("\\") && !slug.includes("\0");
}

/** What a slide's section carries on a page; everything but the slug is for still pages. */
export type SlideStamp = {
  slug: string;
  /** The `data-step` values shown; the slide is the current one, as the player would mark it. */
  shown?: Set<string>;
  /** The beat a still page shows, for its `stillDrawScript`. */
  beat?: { index: number; step: string };
  /** Inline the deck's files as data: URIs, for a page that stands alone. */
  inline?: { deckDir: string };
};

/**
 * One slide section with what the page needs on it, in one parser pass: its `data-slug` unless
 * it names its own, and for a still page the classes and beat the player would have set.
 */
export function stampSlide(html: string, stamp: SlideStamp): string {
  let done = false;
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
  });
}

/** Every slide of the deck in script order, as the player pages hold them. */
export function collectSlidesHtml(deck: ProjectDeck, options: { inline: boolean }): string {
  const slides = deckSlides(deck);
  return deck.deck.sections
    .map((section) =>
      stampSlide(slides.section(section.slug), {
        slug: section.slug,
        ...(options.inline ? { inline: { deckDir: deck.dir } } : {}),
      }),
    )
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
