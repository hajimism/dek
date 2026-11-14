// A like is one signed-in account's mark on a talk anyone may open, once, and taken back at will.

import type { Person } from "../../person/type.ts";
import { type DeckRules, opensToAnyone } from "../access.ts";

export function canLike(
  deck: Pick<DeckRules, "visibility">,
  person: Pick<Person, "id"> | null,
): boolean {
  return opensToAnyone(deck) && person !== null;
}
