// A like is one signed-in account's mark on a talk anyone may open, once, and taken back at will.

import type { Caller } from "../../person/type.ts";
import { type DeckRules, opensWithoutGrant } from "../access.ts";

export function canLike(deck: Pick<DeckRules, "visibility">, person: Caller): boolean {
  return opensWithoutGrant(deck) && person !== null;
}
