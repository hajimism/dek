// Who may read a deck's threads, which of them, and who may resolve one, open it again or share it
// with the guests: the deck's owner, and whoever wrote it. The server knows people by account and
// decides; the page knows them by handle and only shows the button.

import type { CommentRow, ThreadScope } from "../../../../../src/pub/protocol.ts";
import { ApiError } from "../../common/api-error.ts";
import { canManage, type DeckRules } from "../deck/access.ts";
import type { GrantRole, GrantSide } from "../deck/grant/type.ts";
import type { Person } from "../person/type.ts";
import type { ThreadRow } from "./type.ts";

/** The owner and anyone the deck is shared with read its review threads. */
export function canReadComments(
  deck: DeckRules,
  person: Pick<Person, "id"> | null,
  grant: GrantRole | null,
): boolean {
  return canManage(deck, person) || (person !== null && grant !== null);
}

/** Whether someone on `side` may see a thread: the team's side any, the guests' a shared one. */
export function canSeeThread(thread: Pick<ThreadRow, "scope">, side: GrantSide): boolean {
  return thread.scope === "shared" || side === "team";
}

/**
 * The scope a thread opened by someone on `side` takes: what they asked, or by default the
 * narrower one their side may have. The guests' side opens shared threads only.
 */
export function scopeFor(asked: ThreadScope | undefined, side: GrantSide): ThreadScope {
  if (side === "guest" && asked === "team") {
    throw new ApiError(
      403,
      "team_only",
      "only the deck's team may open a thread for the team alone",
      "leave scope out, or send shared",
    );
  }
  return asked ?? (side === "team" ? "team" : "shared");
}

/**
 * The owner, and the thread's author while the deck is still shared with them: an author whose
 * grant is gone reads the threads no more (ADR 52), so they change none either.
 */
export function canResolve(
  deck: { ownerId: string },
  thread: Pick<ThreadRow, "authorId">,
  person: Pick<Person, "id"> | null,
  grant: GrantRole | null,
): boolean {
  if (person === null) {
    return false;
  }
  return person.id === deck.ownerId || (person.id === thread.authorId && grant !== null);
}

export function mayResolve(
  comment: Pick<CommentRow, "author">,
  viewer: { handle: string } | null,
  isOwner: boolean,
): boolean {
  if (!viewer) {
    return false;
  }
  return isOwner || comment.author.handle === viewer.handle;
}

/** Whether the page offers to share a team thread with the guests: to whom may resolve it. */
export function mayWiden(
  comment: Pick<CommentRow, "author" | "scope">,
  viewer: { handle: string } | null,
  isOwner: boolean,
): boolean {
  return comment.scope === "team" && mayResolve(comment, viewer, isOwner);
}

/** Refuse a writer the deck's comments are not open to; every writer is signed in. */
export function mustComment<P extends Pick<Person, "id">>(
  open: boolean,
  person: P | null,
): asserts person is P {
  if (!open || person === null) {
    throw new ApiError(
      403,
      "no_comments",
      "comments on this deck are not open to you",
      person ? undefined : "sign in to comment",
    );
  }
}
