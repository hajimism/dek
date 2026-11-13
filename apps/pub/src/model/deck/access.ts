// Who may do what with a deck, and which of its versions. Pure: the caller loads the deck, the
// person and their grant.

import type { CommentPolicy, Visibility } from "../../../../../src/pub/protocol.ts";
import type { Person } from "../person/type.ts";
import type { GrantRole, GrantSide } from "./grant/type.ts";

type Caller = Pick<Person, "id"> | null;

export type DeckRules = {
  ownerId: string;
  visibility: Visibility;
  comments: CommentPolicy;
};

type Versions = { currentVersion: number | null; latestVersion: number | null };

/** Whether `person` (null when signed out) may open the deck. */
export function canView(deck: DeckRules, person: Caller, grant: GrantRole | null): boolean {
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
export function canComment(deck: DeckRules, person: Caller, grant: GrantRole | null): boolean {
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

/**
 * Which side of the work `person` is on: the owner the team's; a grantee the one their grants
 * give; anyone else, guests included, the client's.
 */
export function sideOf(
  deck: Pick<DeckRules, "ownerId">,
  person: Caller,
  granted: GrantSide | null,
): GrantSide {
  return canManage(deck, person) ? "team" : (granted ?? "client");
}

export function canManage(deck: Pick<DeckRules, "ownerId">, person: Caller): boolean {
  return person?.id === deck.ownerId;
}

/** Whether `person` may read the script: anyone once it is public, else its owner. */
export function canSeeScript(
  deck: Pick<DeckRules, "ownerId"> & { scriptPublic: boolean },
  person: Caller,
): boolean {
  return deck.scriptPublic || canManage(deck, person);
}

/**
 * The version the talk page shows: the current one; for the owner of a deck whose versions were
 * all uploaded with --no-promote, the newest, so the page is never a 404 to the one who
 * published it.
 */
export function shownVersion(
  deck: Pick<DeckRules, "ownerId"> & Versions,
  person: Caller,
): number | null {
  return deck.currentVersion ?? (canManage(deck, person) ? deck.latestVersion : null);
}

/**
 * Whether `person` may read version `n`, its pictures and the comments placed on it: readers the
 * current version only; the owner any version uploaded, as one held back is theirs until it is
 * promoted.
 */
export function mayReadVersion(
  deck: Pick<DeckRules, "ownerId"> & Versions,
  person: Caller,
  n: number,
): boolean {
  if (canManage(deck, person)) {
    return Number.isInteger(n) && n >= 1 && n <= (deck.latestVersion ?? 0);
  }
  return n === deck.currentVersion;
}
