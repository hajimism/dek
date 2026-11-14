// The keys of a public comment's drafts: one below the talk, a reply, and a change to one's own.

import { draftKey } from "../../../common/ui/drafts.ts";

export const draftKeys = {
  /** A public comment on the talk, or a reply to the public comment `parentId`. */
  comment: (deckId: string, parentId: string | null) =>
    parentId ? draftKey(deckId, "public-reply", parentId) : draftKey(deckId, "public"),
  /** A change to the public comment `id`. */
  edit: (deckId: string, id: string) => draftKey(deckId, "public-edit", id),
};
