// Who may do what with a deck, and which of its versions they read. Pure: the caller loads the
// deck, the person and their grant.

import type { CommentPolicy, Visibility } from "../../../../../src/pub/protocol.ts";
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

/** Whether a deck of this visibility opens to anyone, whoever they are: `link` and `public`. */
export function opensToAnyone(deck: Pick<DeckRules, "visibility">): boolean {
  return deck.visibility === "link" || deck.visibility === "public";
}

/**
 * Whether `person` (null when signed out) may open the deck, with the role and the side their
 * grants give them: a `team` deck the owner and the team's side only, a `private` one any grant.
 */
export function canView(
  deck: DeckRules,
  person: Caller,
  grant: GrantRole | null,
  granted: GrantSide | null,
): boolean {
  if (canManage(deck, person) || opensToAnyone(deck)) {
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

/** Where `person` stands with the deck, from the grants that name them on it. */
export function standingOn(
  deck: DeckRules,
  person: Caller,
  grants: readonly Pick<GrantRow, "role" | "side">[],
): Standing {
  const role = strongestRole(grants.map((grant) => grant.role));
  const granted = widestSide(grants.map((grant) => grant.side));
  return {
    opens: canView(deck, person, role, granted),
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
