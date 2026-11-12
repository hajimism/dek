// Where a comment stands on a newer version. A comment names its slide by slug, and a slug
// changes when `dekc mv` renames it; the renames that came with later versions are followed in
// order. A quoted passage is looked for in the slide's spoken paragraphs; when the slide is gone
// and no rename explains it, the passage is looked for on every slide, and found there it moves.

import type { CommentStatus, CommentTarget, SlideMap } from "../../../../src/pub/protocol.ts";

export type ThreadAnchor = {
  slug: string;
  targets: CommentTarget[];
  /** The version the thread was opened on. */
  n: number;
  resolved: boolean;
};

export type RenameRow = { fromSlug: string; toSlug: string; n: number };

export type Placement = { slug: string; status: CommentStatus };

export function placeComment(
  anchor: ThreadAnchor,
  map: SlideMap,
  renames: readonly RenameRow[],
): Placement {
  let slug = anchor.slug;
  let renamed = false;
  for (const rename of renames) {
    if (rename.n > anchor.n && rename.fromSlug === slug) {
      slug = rename.toSlug;
      renamed = true;
    }
  }
  const quotes = anchor.targets.flatMap((target) =>
    target.kind === "quote" ? [target.quote] : [],
  );
  const slide = map.slides.find((candidate) => candidate.slug === slug);
  const status = (found: boolean, moved: boolean): CommentStatus =>
    anchor.resolved ? "resolved" : !found ? "detached" : moved ? "moved" : "open";

  if (slide) {
    const found = quotes.every((quote) => saysQuote(slide.paragraphs, quote));
    return { slug, status: status(found, renamed) };
  }
  if (quotes.length > 0) {
    const elsewhere = map.slides.find((candidate) =>
      quotes.every((quote) => saysQuote(candidate.paragraphs, quote)),
    );
    if (elsewhere) {
      return { slug: elsewhere.slug, status: status(true, true) };
    }
  }
  return { slug, status: status(false, false) };
}

function saysQuote(paragraphs: readonly string[], quote: string): boolean {
  const wanted = squash(quote);
  return paragraphs.some((paragraph) => squash(paragraph).includes(wanted));
}

/** Whitespace differs between how a browser hands a selection over and how the map joins lines. */
function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
