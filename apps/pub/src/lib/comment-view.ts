// How the talk page lays comments out: in the order of what they point at, filtered by state, and
// placed on the article's paragraphs and slide pictures. Pure, over the API's comment rows.

import type { CommentRow, CommentTarget } from "../../../../src/pub/protocol.ts";
import { locateQuote, type Mark } from "./quote.ts";

export type Filter = "open" | "resolved" | "all";

type QuoteTarget = Extract<CommentTarget, { kind: "quote" }>;
type ElementTarget = Extract<CommentTarget, { kind: "element" }>;

export function quoteOf(comment: Pick<CommentRow, "targets">): QuoteTarget | null {
  return comment.targets.find((target): target is QuoteTarget => target.kind === "quote") ?? null;
}

export function elementOf(comment: Pick<CommentRow, "targets">): ElementTarget | null {
  return (
    comment.targets.find((target): target is ElementTarget => target.kind === "element") ?? null
  );
}

export function matchesFilter(comment: Pick<CommentRow, "status">, filter: Filter): boolean {
  if (filter === "all") {
    return true;
  }
  return filter === "resolved" ? comment.status === "resolved" : comment.status !== "resolved";
}

type SlideText = { slug: string; paragraphs: readonly string[] | null };

/** Where in the article a comment points: slide, then paragraph, then offset; the slide itself first. */
function positionOf(comment: CommentRow, slides: readonly SlideText[]): [number, number, number] {
  const slide = slides.findIndex((candidate) => candidate.slug === comment.slug);
  const at = slide === -1 ? slides.length : slide;
  const quote = quoteOf(comment);
  if (!quote) {
    return [at, -1, elementOf(comment) ? (elementOf(comment)?.box.y ?? 0) : -1];
  }
  const paragraphs = slides[slide]?.paragraphs ?? [];
  for (let i = 0; i < paragraphs.length; i++) {
    const range = locateQuote(paragraphs[i] ?? "", quote);
    if (range) {
      return [at, i, range.start];
    }
  }
  return [at, paragraphs.length, 0];
}

export function byPosition(
  comments: readonly CommentRow[],
  slides: readonly SlideText[],
): CommentRow[] {
  const keyed = comments.map((comment) => ({ comment, key: positionOf(comment, slides) }));
  keyed.sort((a, b) => {
    for (let i = 0; i < 3; i++) {
      const diff = (a.key[i] ?? 0) - (b.key[i] ?? 0);
      if (diff !== 0) {
        return diff;
      }
    }
    return a.comment.number - b.comment.number;
  });
  return keyed.map((entry) => entry.comment);
}

/** For each paragraph of a slide, the quotes of its unresolved comments found in it. */
export function paragraphMarks(
  slug: string,
  paragraphs: readonly string[],
  comments: readonly CommentRow[],
): Mark[][] {
  const marks: Mark[][] = paragraphs.map(() => []);
  for (const comment of comments) {
    if (comment.slug !== slug || comment.status === "resolved" || comment.status === "detached") {
      continue;
    }
    const quote = quoteOf(comment);
    if (!quote) {
      continue;
    }
    for (let i = 0; i < paragraphs.length; i++) {
      const range = locateQuote(paragraphs[i] ?? "", quote);
      if (range) {
        marks[i]?.push({ id: comment.id, ...range });
        break;
      }
    }
  }
  return marks;
}

/** Whether `viewer` may resolve or reopen a comment: the talk's owner, or whoever wrote it. */
export function mayResolve(
  comment: Pick<CommentRow, "author">,
  viewer: { handle: string } | null,
  isOwner: boolean,
): boolean {
  if (!viewer) {
    return false;
  }
  return isOwner || (!comment.author.guest && comment.author.handle === viewer.handle);
}

/**
 * The comment as a reader who may not see the script gets it: a quote keeps its place as a quote,
 * but not its words or their surroundings.
 */
export function hideQuotes<T extends Pick<CommentRow, "targets">>(comment: T): T {
  return {
    ...comment,
    targets: comment.targets.map((target) =>
      target.kind === "quote" ? { kind: "quote", quote: "", prefix: "", suffix: "" } : target,
    ),
  };
}
