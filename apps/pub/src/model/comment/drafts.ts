// The keys of a review thread's drafts: a new thread by what it points at, a reply by its thread.

import type { CommentAnchor, CommentTarget } from "../../../../../src/pub/protocol.ts";
import { draftKey } from "../../common/ui/drafts.ts";

/** An element by what it is, not by where it was drawn; a passage by its words and their sides. */
const pointsAt = (target: CommentTarget) =>
  target.kind === "element"
    ? [target.kind, target.path, target.name, target.text]
    : [target.kind, target.quote, target.prefix, target.suffix];

export const draftKeys = {
  /** A new thread on what `anchor` points at. */
  thread: (deckId: string, anchor: CommentAnchor) =>
    draftKey(
      deckId,
      "thread",
      JSON.stringify([anchor.slug, anchor.step, anchor.targets.map(pointsAt)]),
    ),
  /** A reply to the review thread `threadId`. */
  reply: (deckId: string, threadId: string) => draftKey(deckId, "reply", threadId),
};
