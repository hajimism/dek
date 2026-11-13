// Who may open which build of a deck without a token: a public deck's current version, as anyone
// may. The app writes this beside the deck; the serve Worker reads it, and the app's own pictures
// and frames follow the same rule.

import type { DeckAccess, Variant } from "./type.ts";

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
