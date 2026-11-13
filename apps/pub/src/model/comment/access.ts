// Who may resolve a comment or open it again: the deck's owner, and whoever wrote it. The server
// knows people by account and decides; the page knows them by handle and only shows the button.

import type { CommentRow } from "../../../../../src/pub/protocol.ts";
import { ApiError } from "../../common/api-error.ts";
import { canComment, canManage, type DeckRules } from "../deck/access.ts";
import type { GrantRole } from "../deck/grant/type.ts";
import type { Person } from "../person/type.ts";
import type { ThreadRow } from "./type.ts";

/** The owner, and those who may comment, read a deck's comments. */
export function canReadComments(
  deck: DeckRules,
  person: Pick<Person, "id"> | null,
  grant: GrantRole | null,
): boolean {
  return canManage(deck, person) || canComment(deck, person, grant);
}

/**
 * Whether `person` may see a thread: the owner any; anyone else one opened on a version no newer
 * than the current one, so a note on a version held back stays the owner's while it is.
 */
export function canSeeThread(
  deck: { ownerId: string; currentVersion: number | null },
  thread: Pick<ThreadRow, "n">,
  person: Pick<Person, "id"> | null,
): boolean {
  return canManage(deck, person) || thread.n <= (deck.currentVersion ?? 0);
}

export function canResolve(
  deck: { ownerId: string },
  thread: Pick<ThreadRow, "authorId">,
  person: Pick<Person, "id"> | null,
): boolean {
  return person !== null && (person.id === deck.ownerId || person.id === thread.authorId);
}

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

/** Refuse a writer the deck's comments are not open to. */
export function mustComment(open: boolean, person: Pick<Person, "id"> | null): void {
  if (!open) {
    throw new ApiError(
      403,
      "no_comments",
      "comments on this deck are not open to you",
      person ? undefined : "sign in to comment",
    );
  }
}
