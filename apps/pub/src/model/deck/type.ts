// A deck is a talk on dek.pub: who owns it, who may see it, and the version readers get.

import type { decks } from "@schema";
import type { TalkCard } from "../../../../../src/pub/protocol.ts";

export type Deck = typeof decks.$inferSelect;

/** What may change on a deck after it is made. */
export type DeckPatch = Partial<Pick<Deck, "visibility" | "scriptPublic" | "embed" | "comments">>;

/** A talk as a list shows it: on the landing page, a profile, under "more by". */
export type { TalkCard };
