// Who may do what with a deck. Pure: the caller loads the deck, the person and their grant.

import type { CommentPolicy, Visibility } from "../../../../src/pub/protocol.ts";

export type Person = {
  id: string;
  handle: string;
  name: string;
  email?: string;
  emailVerified?: boolean;
};

export type DeckRules = {
  ownerId: string;
  visibility: Visibility;
  comments: CommentPolicy;
};

export type GrantRole = "view" | "comment";

/** Whether `person` (null when signed out) may open the deck. */
export function canView(deck: DeckRules, person: Person | null, grant: GrantRole | null): boolean {
  if (person?.id === deck.ownerId) {
    return true;
  }
  if (deck.visibility !== "private") {
    return true;
  }
  return grant !== null;
}

/**
 * Whether `person` may comment: the owner always; someone granted `comment` always; on a deck
 * they may open, others as the deck's policy says, a guest only under `guests`.
 */
export function canComment(
  deck: DeckRules,
  person: Person | null,
  grant: GrantRole | null,
): boolean {
  if (person?.id === deck.ownerId || grant === "comment") {
    return true;
  }
  if (!canView(deck, person, grant) || deck.visibility === "private") {
    return false;
  }
  if (deck.comments === "off") {
    return false;
  }
  return person !== null || deck.comments === "guests";
}

export function canManage(deck: DeckRules, person: Person | null): boolean {
  return person?.id === deck.ownerId;
}
