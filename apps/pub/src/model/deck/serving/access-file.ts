// Who may open which build of a deck without a token: a public deck's current version, as anyone
// may. The app writes this beside the deck; the serve Worker reads it, and the app's own pictures
// and frames follow the same rule.

import type { DeckAccess, ServeClaims, Variant } from "./type.ts";

export function accessOf(deck: {
  visibility: DeckAccess["visibility"];
  scriptPublic: boolean;
  embed: boolean;
  currentVersion: number | null;
}): DeckAccess {
  return {
    visibility: deck.visibility,
    scriptPublic: deck.scriptPublic,
    embed: deck.embed,
    current: deck.currentVersion,
  };
}

/** Whether version `n` is open to anyone: the current version of a public deck. */
export function isOpen(access: Pick<DeckAccess, "visibility" | "current">, n: number): boolean {
  return access.visibility === "public" && access.current === n;
}

/** The build a reader gets: what is said aloud when the script is public, else the bare slides. */
export function readerVariant(scriptPublic: boolean): Variant {
  return scriptPublic ? "public" : "bare";
}

/**
 * The access file to write before a deck changes from `before` to `after`, so that a failure
 * between the two writes leaves it serving no more than either: what `after` closes is closed,
 * and nothing `after` opens is opened yet. Null when the change closes nothing, and the file can
 * wait for the row.
 */
export function narrowing(before: DeckAccess, after: DeckAccess): DeckAccess | null {
  const narrowed: DeckAccess = {
    visibility: before.visibility === "public" ? after.visibility : before.visibility,
    scriptPublic: before.scriptPublic && after.scriptPublic,
    embed: before.embed && after.embed,
    current: before.current,
  };
  const closes =
    narrowed.visibility !== before.visibility ||
    narrowed.scriptPublic !== before.scriptPublic ||
    narrowed.embed !== before.embed;
  return closes ? narrowed : null;
}

/** What the serve Worker answers for a version: a build, or a refusal. */
export type Serving =
  | { status: 200; variant: Variant; open: boolean; embeddable: boolean }
  | { status: 403 | 404 };

/**
 * What the serve Worker hands out for version `n` of deck `deckId`, given its access file and the
 * token the URL carries: `claims` when the token verified, "invalid" when it did not, null when
 * there is none. A token opens the one build it was signed for, of this deck and version, and an
 * expired or foreign one is told apart from a deck that is not there, so the page can reload. With
 * no token, only what `isOpen` allows is served, and only that may be framed by any page.
 */
export function serving(
  deckId: string,
  access: DeckAccess | null,
  n: number,
  claims: ServeClaims | "invalid" | null,
): Serving {
  if (!access) {
    return { status: 404 };
  }
  if (claims !== null) {
    return claims === "invalid" || claims.deck !== deckId || claims.n !== n
      ? { status: 403 }
      : { status: 200, variant: claims.variant, open: false, embeddable: false };
  }
  return isOpen(access, n)
    ? {
        status: 200,
        variant: readerVariant(access.scriptPublic),
        open: true,
        embeddable: access.embed,
      }
    : { status: 404 };
}
