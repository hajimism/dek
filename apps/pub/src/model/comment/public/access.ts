// Who may post, change and remove the public comments at the bottom of a talk. They are on a talk
// anyone may open, `link` or `public`; the deck's comment policy says who may post them.

import { canManage, type DeckRules, opensToAnyone } from "../../deck/access.ts";
import type { Person } from "../../person/type.ts";

type Caller = Pick<Person, "id"> | null;

export function publicCommentsOn(deck: Pick<DeckRules, "visibility">): boolean {
  return opensToAnyone(deck);
}

/** Anyone signed in under `signed-in`, no one under `off`; never anyone signed out. */
export function canPostPublic(deck: DeckRules, person: Caller): boolean {
  return publicCommentsOn(deck) && deck.comments !== "off" && person !== null;
}

export function mayEditPublic(comment: { authorId: string }, person: Caller): boolean {
  return person !== null && comment.authorId === person.id;
}

export function mayDeletePublic(
  deck: Pick<DeckRules, "ownerId">,
  comment: { authorId: string },
  person: Caller,
): boolean {
  return mayEditPublic(comment, person) || canManage(deck, person);
}
