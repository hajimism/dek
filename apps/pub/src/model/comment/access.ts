// Who may read a deck's threads, which of them, and who may resolve one, open it again or share it
// with the client: the deck's owner, and whoever wrote it. The server knows people by account and
// decides; the page knows them by handle and only shows the button.

import type { CommentRow, ThreadScope } from "../../../../../src/pub/protocol.ts";
import { ApiError } from "../../common/api-error.ts";
import { canComment, canManage, type DeckRules } from "../deck/access.ts";
import type { GrantRole, GrantSide } from "../deck/grant/type.ts";
import type { Person } from "../person/type.ts";
import type { ThreadRow } from "./type.ts";

/** The owner, those who may comment, and anyone the deck is shared with read its comments. */
export function canReadComments(
  deck: DeckRules,
  person: Pick<Person, "id"> | null,
  grant: GrantRole | null,
): boolean {
  return canManage(deck, person) || grant !== null || canComment(deck, person, grant);
}

/**
 * Whether someone on `side` may see a thread. By version: the team's side any; the client's one
 * opened on a version no newer than the current one, so a thread on a draft stays the team's
 * until that version or a later one is current. By scope: the team's side any; the client's a
 * shared one only.
 */
export function canSeeThread(
  deck: { currentVersion: number | null },
  thread: Pick<ThreadRow, "n" | "scope">,
  side: GrantSide,
): boolean {
  const byVersion = side === "team" || thread.n <= (deck.currentVersion ?? 0);
  const byScope = thread.scope === "shared" || side === "team";
  return byVersion && byScope;
}

/**
 * The scope a thread opened by someone on `side` takes: what they asked, or by default the
 * narrower one their side may have. The client's side opens shared threads only.
 */
export function scopeFor(asked: ThreadScope | undefined, side: GrantSide): ThreadScope {
  if (side === "client" && asked === "team") {
    throw new ApiError(
      403,
      "team_only",
      "only the deck's team may open a thread for the team alone",
      "leave scope out, or send shared",
    );
  }
  return asked ?? (side === "team" ? "team" : "shared");
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

/** Whether the page offers to share a team thread with the client: to whom may resolve it. */
export function mayWiden(
  comment: Pick<CommentRow, "author" | "scope">,
  viewer: { handle: string } | null,
  isOwner: boolean,
): boolean {
  return comment.scope === "team" && mayResolve(comment, viewer, isOwner);
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
