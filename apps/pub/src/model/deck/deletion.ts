// What deleting a deck takes away in D1: every row of it. Its files in R2 are everything under
// `deckPrefix`, the access file among them, which goes first (ADR 82).

/**
 * A table that holds rows of a deck, and the column that names it: the deck's own ID, or, for a
 * row that names another of the deck's rows instead, that row's ID in the table `through`.
 */
type DeckRows =
  | { table: string; column: "deck_id" | "id" }
  | { table: string; column: string; through: string };

/**
 * Every table with rows of a deck. The schema has no foreign keys, so nothing cascades: each is
 * named here, and a unit test holds the list to the schema. A reply names its thread, so the
 * replies go while the threads are still there to find them by; the deck goes last.
 */
export const DECK_ROWS = [
  { table: "replies", column: "thread_id", through: "threads" },
  { table: "threads", column: "deck_id" },
  { table: "public_comments", column: "deck_id" },
  { table: "likes", column: "deck_id" },
  { table: "mutes", column: "deck_id" },
  { table: "grants", column: "deck_id" },
  { table: "renames", column: "deck_id" },
  { table: "versions", column: "deck_id" },
  { table: "decks", column: "id" },
] as const satisfies readonly DeckRows[];

/** The name of a table DECK_ROWS deletes from. */
export type DeckTable = (typeof DECK_ROWS)[number]["table"];
