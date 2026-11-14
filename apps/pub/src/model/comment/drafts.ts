// What a person typed into a composer and has not sent, kept in this browser so a reload does not
// lose it. Each composer has its own key: the deck, the kind of text, and what it answers to.
// Where storage is blocked, or on the server where there is none, nothing is kept.

import type { CommentAnchor, CommentTarget } from "../../../../../src/pub/protocol.ts";

const PREFIX = "dek.pub:draft";

/** An element by what it is, not by where it was drawn; a passage by its words and their sides. */
const pointsAt = (target: CommentTarget) =>
  target.kind === "element"
    ? [target.kind, target.path, target.name, target.text]
    : [target.kind, target.quote, target.prefix, target.suffix];

export const draftKeys = {
  /** A new thread on what `anchor` points at. */
  thread: (deckId: string, anchor: CommentAnchor) =>
    `${PREFIX}:${deckId}:thread:${JSON.stringify([anchor.slug, anchor.step, anchor.targets.map(pointsAt)])}`,
  /** A reply to the review thread `threadId`. */
  reply: (deckId: string, threadId: string) => `${PREFIX}:${deckId}:reply:${threadId}`,
  /** A public comment on the talk, or a reply to the public comment `parentId`. */
  public: (deckId: string, parentId: string | null) =>
    parentId ? `${PREFIX}:${deckId}:public-reply:${parentId}` : `${PREFIX}:${deckId}:public`,
  /** A change to the public comment `id`. */
  edit: (deckId: string, id: string) => `${PREFIX}:${deckId}:public-edit:${id}`,
};

/** The text kept under `key`, or "" when there is none. */
export function readDraft(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

/** Keep `text` under `key`; text with nothing in it takes the draft away. */
export function keepDraft(key: string, text: string): void {
  try {
    if (text.trim()) {
      localStorage.setItem(key, text);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Storage is blocked or full: the text stays on the page alone, as it did before drafts.
  }
}

export function dropDraft(key: string): void {
  keepDraft(key, "");
}
