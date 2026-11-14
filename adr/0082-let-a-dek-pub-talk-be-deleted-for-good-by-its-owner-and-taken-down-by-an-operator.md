# 82. Let a dek.pub talk be deleted for good by its owner, and taken down by an operator

Date: 2026-11-14

## Status

Accepted

Amends [47. Put a talk on dek.pub with the dekc pub commands](0047-put-a-talk-on-dek-pub-with-the-dekc-pub-commands.md)

Amends [79. Open dek.pub by invitation to the people it lists and those a deck is shared with](0079-open-dek-pub-by-invitation-to-the-people-it-lists-and-those-a-deck-is-shared-with.md)

## Context

Nobody could delete a talk. The deck routes took `GET` and `PATCH` only, and the app's list of what it does not do yet had deleting among what dek.pub needs before it opens by invitation. An owner could not take back a talk put up by mistake. Whoever runs dek.pub could not remove a talk that breaks the law or the terms, short of editing D1 and R2 by hand.

A talk is spread over several places:

- In D1, the `decks` row and the rows keyed by its ID: `versions`, `renames`, `threads`, `grants`, `mutes`, `public_comments` and `likes`. A `replies` row names its thread, not the deck. The schema has no foreign keys, so nothing cascades. Better Auth's tables and `profile_links` hold nothing of a deck.
- In R2, everything under `decks/<id>/`: the access file the serve Worker reads (`access.json`), and each version's builds, source tar and pictures under `v/<n>/`. Since ADR 71 only the current version is kept, but an upload cut short can leave files above it.

The serve Worker answers nothing for a deck with no access file, with a token or without. The app finds a deck's pictures, its frame and its pages only through its rows. Every owner change goes through `updateDeck` and every version through `recordVersion`, and both write the access file again (`syncAccess`).

`dekc pub` names a deck by the `pub:` that `publish` writes into `script.md` (ADR 46, 47). None of its commands asks for confirmation; `grants remove` acts at once.

## Decision

**`DELETE /api/decks/:id` deletes a talk for good: every row and every file of it.** It answers `DeckDeleted`, `{ deleted: true, id, owner, slug }`, which the protocol gains. `deleteDeck` in `src/model/deck/store.server.ts` does it in three steps, in this order:

1. It deletes the access file (`removeAccess`, beside `syncAccess`). From then on the serve Worker hands out nothing of the deck. A failure here throws before anything else has changed, so the deck stays as it was and the request can be made again.
2. It deletes every row of the deck in one D1 batch. `DECK_ROWS` in `src/model/deck/deletion.ts` lists the tables and the column that names the deck. Replies go by the IDs of the deck's threads, before the threads go, and the deck row goes last. The batch is atomic: either the deck and all its rows are gone, or none are. Once it has run, the talk page, the manage page, the pictures at `/i/` and every API route keyed by the ID answer the 404 of a deck that does not exist; the profile, the feed and the sitemap no longer list it; and the owner's slug is free.
3. It deletes every file left under `decks/<id>/` (`deckPrefix`), a thousand keys at a time.

`deleteDeck` is the third function besides `updateDeck` and `recordVersion` that touches the access file. It takes the file away instead of writing it.

**A file that fails to be deleted in step 3 is logged and left.** No retry runs after the answer, and no sweep looks for such files. By then the rows are gone, so the app reaches no file of the deck, and the serve Worker reaches none without an access file. A file left there costs storage and nothing else. Answering 500 would be wrong too: the deck is gone, and the owner cannot ask again, since a second `DELETE` gets a 404.

**A change made while the deck is being deleted cannot leave it served for long.** `syncAccess` writes the access file only while the deck's row is there, and only over the file it read (ADR 71). One that runs between step 1 and step 2 can write the file again, and step 3 deletes that file with the rest. In that moment, a reader who already holds a serve token, or anyone for a `public` deck's current version, could still be served. A public build is cached for a minute and a picture for five, as before, so a reader's cache or the edge may keep a copy that long after any deletion.

**`DECK_ROWS` is held to the schema by a unit test.** The test reads every table in `db/schema.ts`. Each table with a `deck_id` column must be in the list by it, each with a `thread_id` column by its thread, and `decks` by `id`. A table added later with rows of a deck fails the test until it is listed. The end-to-end run checks the same in D1: before the delete, the deck has a row in every table with a `deck_id` column, and after it, none. `DECK_TABLES` in the store maps each name to its Drizzle table, and its type makes the map cover the list.

**Who may delete: the deck's owner, or an operator.** `canDelete(deck, person, operator)` in `access.ts` says so. `deletableDeck` gives anyone else the 404 a missing deck gets, as every route here does.

- **The operators are a setting, `DEK_PUB_OPERATORS`:** handles, with or without `@`, split by commas or whitespace. `readOperators` (`src/model/person/operator.ts`) reads it with `listSetting` (`src/common/list-setting.ts`), the splitting `readInvited` now uses too (ADR 79), and drops any entry that is not a handle. `isOperator` (`operator.server.ts`) reads the setting. It defaults to empty, which names no one, and `dev.env` sets it empty.
- **A handle names an operator, not an address or a GitHub login.** dek.pub knows a person by their handle, and a handle cannot be changed (ADR 77), so a name in the setting keeps naming the same person. `operator` and `moderator` are reserved handles; an operator's handle is their own.
- **An operator may do nothing else.** They cannot open a talk that is not theirs, nor change one. Deleting is all a takedown needs.
- **An operator's deletion is logged** through `log` (`src/common/log.ts`), as `an operator took a deck down`, with the deck's ID, the owner's account ID and the operator's account ID. It logs no handle, title or address.

**`dekc pub delete [deck] --yes` deletes the deck that `pub:` names.** Its owner runs it in the project, as they run `share` and `status`.

- **`--yes` is required.** Without it nothing is sent. The error says which deck would be deleted, and its hint gives the command with `--yes`. The command runs without a terminal, so it never asks a question. An agent reads the error, and a person or an agent confirms by running the command again. `--yes` is a new flag, taken by `delete` and `takedown` alone.
- **After the deletion, `pub:` is taken out of `script.md`.** Every other byte stays as it was (`withoutFrontmatterKey`, beside `withFrontmatterKey`). `changed` names `script.md`, to commit, as `publish` does when it writes `pub:`. The next `dekc pub publish` then makes a new deck at the same slug. Left in place, `pub:` would make the next publish get a 404 for a deck that is gone.
- **A deck dek.pub does not have, or that is not the caller's, is refused, and `pub:` is left as it was.** A command that fails changes nothing. The hint for a 404 from any `dekc pub` command now also says that a deck deleted from dek.pub is gone, and to take `pub:` out to publish it as a new one. An owner reaches that state after deleting on the manage page, or after a takedown.
- `--json` returns `{ action: "delete", server, id, owner, slug, changed }`.

**`dekc pub takedown <talk> --yes` deletes a talk named by its URL or its deck ID, from any directory.** An operator uses it. The manage page is the owner's alone and gives everyone else a 404, so an operator has no page of their own; the command is their only way in.

- **It is a separate subcommand, not a form of `delete`.** `delete` names a deck of the project it runs in, and the CLI resolves that deck before the command runs. A takedown has no project. Two subcommands also say in the command line, in help and in the docs which act is meant.
- **`<talk>` is a deck ID, `d_…`, or the talk's URL on the server asked**, `/@handle/slug`, with or without `?key=`. A report of abuse comes with a URL, so the URL is enough. A URL on another server, or one that names no talk, is refused before anything is sent.
- **A URL is turned into a deck ID by `GET /api/people/:handle/talks/:slug`** (`paths.talk`). It answers the deck's `DeckStatus` to its owner or an operator, and a 404 to anyone else.
- `--json` returns `{ action: "takedown", server, id, owner, slug }`. No file is changed. The owner may run it too, on their own talk.

**The manage page has Delete talk at its bottom.** A button opens a dialog that says what goes and that it cannot be undone. Its Delete for good button is enabled only once the talk's slug is typed into the field, as GitHub asks for a repository's name before deleting it. There is no Undo. Once the talk is deleted, the page goes to the owner's profile.

**`PROTOCOL_VERSION` stays 2.** A new route, a new method on a route, and a new answer change nothing an older dekc sends or reads.

**What was not chosen:**

- **A soft delete**, with a `deleted_at` column and a purge later. The talk could be brought back, but every query would have to leave deleted decks out, and the data would stay after the person was told it was gone. An owner who deletes means it, and the dialog asks for the slug first.
- **Deleting the R2 files before the rows**, so that a failure could be retried while the deck still exists. Between the steps, the talk page would show a deck whose files are gone. The failure that order guards against costs only storage, as said above.
- **Deleting the files after the answer, with `waitUntil`.** The answer would come sooner, but a failure would be logged where no test sees it, and the end-to-end run could not check R2 right after the delete. A deck keeps one version, so there are few files to delete.
- **Foreign keys with `ON DELETE CASCADE`.** SQLite cannot add a foreign key to an existing table without rebuilding it, and D1 needs `PRAGMA foreign_keys` on for every connection. A list held to the schema by a test does the same job.
- **Operators named by address or GitHub login**, as `DEK_PUB_INVITED` names people. An address can pass from one account to another over time, and an account made by email has no GitHub login. A handle names one account for good.
- **Answering an operator differently for a talk that does not exist.** An operator gets the same answers as anyone else, apart from being allowed to delete.

## Consequences

- An owner can take a talk back, from the CLI or the manage page, and publish again at the same URL as a new deck. Nothing of the old one carries over: not the threads, the likes, the grants or the link key.
- A deletion cannot be undone, by the owner or by whoever runs dek.pub. The only way back is D1's Time Travel, with R2 as it is, which nothing has tried yet.
- A file that a failed step 3 left in R2 stays there unseen, and only the log shows it. If that happens often, a sweep of the `decks/<id>/` prefixes with no `decks` row is needed.
- An operator can delete anyone's talk without opening it, so a mistaken takedown is as final as an owner's own deletion. The log keeps who did it.
- A new table with rows of a deck has to be added to `DECK_ROWS` and `DECK_TABLES`; the unit test fails until it is.
- `dekc pub delete`, `dekc pub takedown` and `--yes` are new. Their docs, `llms.txt`, the `--json` schema and the commands' usage name them.
- Deleting an account is still done by hand on request, and has to delete the account's decks with `deleteDeck`.
