// Who may post, change and remove the public comments at the bottom of a talk. They are on a talk
// anyone may open, `link` or `public`; the deck's comment policy says who may post them.

import { ApiError } from "../../../common/api-error.ts";
import { canManage, type DeckRules, opensToAnyone } from "../../deck/access.ts";
import type { Person } from "../../person/type.ts";

type Caller = Pick<Person, "id"> | null;

/** Anyone signed in under `signed-in`, no one under `off`; never anyone signed out. */
export function canPostPublic(deck: DeckRules, person: Caller): boolean {
  return opensToAnyone(deck) && deck.comments !== "off" && person !== null;
}

/** Refuse a poster canPostPublic does not let post; one signed out is asked to sign in. */
export function mustPostPublic<P extends Pick<Person, "id">>(
  deck: DeckRules,
  person: P | null,
): asserts person is P {
  if (person === null || !canPostPublic(deck, person)) {
    throw new ApiError(
      403,
      "no_comments",
      "comments on this talk are not open to you",
      person || deck.comments === "off" ? undefined : "sign in to comment",
    );
  }
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
