// Who may do what with a deck, and which of its versions they read. Pure: the caller loads the
// deck, the person and their grant.

import type { CommentPolicy, Visibility } from "../../../../../src/pub/protocol.ts";
import { sameKey } from "../../common/ids.ts";
import type { Person } from "../person/type.ts";
import { strongestRole, widestSide } from "./grant/grant.ts";
import type { GrantRole, GrantRow, GrantSide } from "./grant/type.ts";
import type { Standing } from "./type.ts";

type Caller = Pick<Person, "id"> | null;

export type DeckRules = {
  ownerId: string;
  visibility: Visibility;
  comments: CommentPolicy;
};

/** The rules with the key a `link` deck opens by, kept unused while it is any other visibility. */
export type OpeningRules = DeckRules & { linkKey: string | null };

/**
 * Whether a deck of this visibility opens to people it has no grant for: a `public` one to anyone,
 * a `link` one to anyone holding its key. Only these have public comments and likes.
 */
export function opensWithoutGrant(deck: Pick<DeckRules, "visibility">): boolean {
  return deck.visibility === "link" || deck.visibility === "public";
}

/**
 * Whether `person` (null when signed out), holding `key` from the URL, may open the deck, with the
 * role and the side their grants give them: a `team` deck the owner and the team's side only, a
 * `private` one any grant, a `link` one any grant or its key, a `public` one anyone.
 */
export function canView(
  deck: OpeningRules,
  person: Caller,
  grant: GrantRole | null,
  granted: GrantSide | null,
  key: string | null,
): boolean {
  if (canManage(deck, person) || deck.visibility === "public") {
    return true;
  }
  if (deck.visibility === "link" && sameKey(deck.linkKey, key)) {
    return true;
  }
  return deck.visibility === "team" ? granted === "team" : grant !== null;
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

/** Where `person` stands with the deck, from the grants that name them on it and the key they hold. */
export function standingOn(
  deck: OpeningRules,
  person: Caller,
  grants: readonly Pick<GrantRow, "role" | "side">[],
  key: string | null,
): Standing {
  const role = strongestRole(grants.map((grant) => grant.role));
  const granted = widestSide(grants.map((grant) => grant.side));
  return {
    opens: canView(deck, person, role, granted, key),
    role,
    side: sideOf(deck, person, granted),
  };
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
 * What version `n` is to the deck: the current one, the only one anyone who may see the deck reads,
 * with its pictures and the comments placed on it; one gone before it, which a page left open may
 * still show; or one it never had.
 */
export function versionStanding(
  deck: { currentVersion: number | null },
  n: number,
): "current" | "gone" | "unknown" {
  if (n === deck.currentVersion) {
    return "current";
  }
  return Number.isInteger(n) && n >= 1 && n < (deck.currentVersion ?? 0) ? "gone" : "unknown";
}
