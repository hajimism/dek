// What deleting a deck takes away in D1, every row of it, and the order the steps go in. Its files
// in R2 are everything under `deckPrefix`, the access file among them, which goes first (ADR 82).

import { log } from "../../common/log.ts";

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

/** The steps that delete a deck, each against one store, as `deleteInOrder` runs them. */
type DeletionSteps = {
  /** Delete the access file, so the serve Worker hands out nothing of the deck. */
  removeAccess(): Promise<void>;
  /** Delete every row of the deck, in one batch. */
  deleteRows(): Promise<void>;
  /** Delete every file under the deck's prefix. */
  deleteFiles(): Promise<void>;
};

/**
 * Delete a deck: its access file, every row, its access file again, then every file. A failure
 * before the rows go throws, and leaves the deck as it was. One after is logged, each step on its
 * own line, and the next step still runs: the deck is gone, and a second try would get a 404. The
 * access file goes again once the rows are gone, since a `syncAccess` that read the row before can
 * have written it since; with it gone, a sweep that fails leaves files nothing serves.
 */
export async function deleteInOrder(deckId: string, steps: DeletionSteps): Promise<void> {
  await steps.removeAccess();
  await steps.deleteRows();
  try {
    await steps.removeAccess();
  } catch (error) {
    log("error", `the access file of the deleted deck ${deckId} was not deleted`, error);
  }
  try {
    await steps.deleteFiles();
  } catch (error) {
    log("error", `the files of the deleted deck ${deckId} were not all deleted`, error);
  }
}
