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
 * Whether `person` may write review threads: the owner, and anyone granted `comment`. The deck's
 * comment policy is about its public comments, not these.
 */
export function canComment(deck: DeckRules, person: Caller, grant: GrantRole | null): boolean {
  return canManage(deck, person) || (person !== null && grant === "comment");
}

/**
 * Which side of the work `person` is on: the owner the team's; a grantee the one their grants
 * give; anyone else, signed out included, the guests'.
 */
export function sideOf(
  deck: Pick<DeckRules, "ownerId">,
  person: Caller,
  granted: GrantSide | null,
): GrantSide {
  return canManage(deck, person) ? "team" : (granted ?? "guest");
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
 * The version the talk page shows. The guests' side reads the current one, and asking for any
 * other finds nothing. The team's side reads the one it asks for, of those uploaded; by default
 * the current one, or the newest while none is current, so a deck whose versions were all
 * uploaded with --no-promote is never missing to the team that made it.
 */
export function shownVersion(deck: Versions, side: GrantSide, asked: number | null): number | null {
  if (asked !== null) {
    return mayReadVersion(deck, side, asked) ? asked : null;
  }
  return side === "team" ? (deck.currentVersion ?? deck.latestVersion) : deck.currentVersion;
}

/**
 * Whether someone on `side` may read version `n`, its pictures and the comments placed on it: the
 * guests' side the current version only; the team's any version uploaded, the drafts included.
 */
export function mayReadVersion(deck: Versions, side: GrantSide, n: number): boolean {
  if (side === "team") {
    return Number.isInteger(n) && n >= 1 && n <= (deck.latestVersion ?? 0);
  }
  return n === deck.currentVersion;
}
