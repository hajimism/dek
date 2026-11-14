# 82. Let a dek.pub talk be deleted for good by its owner, and taken down by an operator

Date: 2026-11-14

## Status

Accepted

Amends [47. Put a talk on dek.pub with the dekc pub commands](0047-put-a-talk-on-dek-pub-with-the-dekc-pub-commands.md)

Amends [79. Open dek.pub by invitation to the people it lists and those a deck is shared with](0079-open-dek-pub-by-invitation-to-the-people-it-lists-and-those-a-deck-is-shared-with.md)

Amended by [85. Let dek.pub's operators invite people to sign up from the settings page, and keep who is invited in D1](0085-let-dek-pub-s-operators-invite-people-to-sign-up-from-the-settings-page-and-keep-who-is-invited-in-d1.md)

## Context

Nobody could delete a talk. The deck routes took `GET` and `PATCH` only, and the app's list of what it does not do yet had deleting among what dek.pub needs before it opens by invitation. An owner could not take back a talk put up by mistake. Whoever runs dek.pub could not remove a talk that breaks the law or the terms, short of editing D1 and R2 by hand.

A talk is spread over several places:

- In D1, the `decks` row and the rows keyed by its ID: `versions`, `renames`, `threads`, `grants`, `mutes`, `public_comments` and `likes`. A `replies` row names its thread, not the deck. The schema has no foreign keys, so nothing cascades. Better Auth's tables and `profile_links` hold nothing of a deck.
- In R2, everything under `decks/<id>/`: the access file the serve Worker reads (`access.json`), and each version's builds, source tar and pictures under `v/<n>/`. Since ADR 71 only the current version is kept, but an upload cut short can leave files above it.

The serve Worker answers nothing for a deck with no access file, with a token or without. The app finds a deck's pictures, its frame and its pages only through its rows. Every owner change goes through `updateDeck` and every version through `recordVersion`, and both write the access file again (`syncAccess`).

`dekc pub` names a deck by the `pub:` that `publish` writes into `script.md` (ADR 46, 47). None of its commands asks for confirmation; `grants remove` acts at once.

## Decision

**`DELETE /api/decks/:id` deletes a talk for good: every row and every file of it.** It answers `DeckDeleted`, `{ deleted: true, id, owner, slug }`, which the protocol gains. `deleteDeck` in `src/model/deck/store.server.ts` does it in four steps, in the order `deleteInOrder` in `src/model/deck/deletion.ts` keeps, which a unit test checks with stand-ins for D1 and R2:

1. It deletes the access file (`removeAccess`, beside `syncAccess`). From then on the serve Worker hands out nothing of the deck. A failure here throws before anything else has changed, so the deck stays as it was and the request can be made again.
2. It deletes every row of the deck in one D1 batch. `DECK_ROWS` in `src/model/deck/deletion.ts` lists the tables and the column that names the deck. Replies go by the IDs of the deck's threads, before the threads go, and the deck row goes last. The batch is atomic: either the deck and all its rows are gone, or none are. Once it has run, the talk page, the manage page, the pictures at `/i/` and every API route keyed by the ID answer the 404 of a deck that does not exist; the profile, the feed and the sitemap no longer list it; and the owner's slug is free.
3. It deletes the access file again, for a `syncAccess` that read the deck's row before the batch and wrote the file after step 1. A failure here is logged on a line of its own, and step 4 still runs.
4. It deletes every file left under `decks/<id>/` (`deckPrefix`), a thousand keys at a time.

`deleteDeck` is the third function besides `updateDeck` and `recordVersion` that touches the access file. It takes the file away instead of writing it.

**A file that fails to be deleted in step 4 is logged and left.** No retry runs after the answer, and no sweep looks for such files. By then the rows are gone, so the app reaches no file of the deck, and the serve Worker reaches none without an access file, which step 3 took away. Such a file costs storage, unless it is the access file itself: when steps 3 and 4 both fail to delete it after a racing `syncAccess` wrote it, or when such a write lands after step 3, the serve Worker goes on serving what that file opens, a `public` deck's current version to anyone, until the file is deleted by hand. Both failures are logged, each with the deck's ID. Answering 500 would be wrong too: the deck is gone, and the owner cannot ask again, since a second `DELETE` gets a 404.

**A change made while the deck is being deleted is undone by step 3.** `syncAccess` writes the access file only after reading the deck's row, and only over the file it read (ADR 71). One that reads the row before step 2 can write the file again after step 1; step 3 deletes that file, and step 4 deletes it too. Only a write that lands after step 3, from a `syncAccess` that read the row before step 2, outlives step 3, and step 4 then deletes it unless the sweep fails. Until the file goes, a reader who already holds a serve token, or anyone for a `public` deck's current version, could still be served. A public build is cached for a minute and a picture for five, as before, so a reader's cache or the edge may keep a copy that long after any deletion.

**`DECK_ROWS` is held to the schema by a unit test.** The test reads every table in `db/schema.ts`. Each table with a `deck_id` column must be in the list by it, each with a `thread_id` column by its thread, and `decks` by `id`. A table added later with rows of a deck fails the test until it is listed. The end-to-end run checks the same in D1: before the delete, the deck has a row in every table with a `deck_id` column, and after it, none. `DECK_TABLES` in the store maps each name to its Drizzle table, and its type makes the map cover the list.

**Who may delete: the deck's owner, or an operator.** `canDelete(deck, person, operator)` in `access.ts` says so. `deletableDeck` gives anyone else the 404 a missing deck gets, as every route here does.

- **The operators are a setting, `DEK_PUB_OPERATORS`:** email addresses, split by commas or whitespace. An operator's account is the one whose address is listed and verified. `readOperators` (`src/model/person/operator.ts`) reads the setting with `listSetting` (`src/common/list-setting.ts`), the splitting `readInvited` now uses too (ADR 79), and keeps only the entries `isAddressEntry` takes for an address, as `readInvited` does; a handle, `@<GitHub login>` or `*` counts for nothing. `namesOperator` holds an account to the list, and `isOperator` (`operator.server.ts`) asks it of the setting. It defaults to empty, which names no one, and `dev.env` sets it empty.
- **A verified address names an operator, not a handle, a user ID or a GitHub login.** Handles are first come, first served (ADR 77), so whoever claimed a listed handle first would become an operator, and a handle freed with its account would pass the role on to whoever took it next. A user ID does not exist until the account is made, so it could not name the first operator of a new database; and the change after this one moves sign-up invitations into D1, managed by operators, so the first operator must be able to sign up from the settings alone. A GitHub login can be renamed, and the old one taken by someone else on GitHub. An address cannot be changed on dek.pub (`/change-email` is closed in `auth.ts`), and only a verified one counts, so an account made by the development email form, which verifies none, is never an operator's.
- **An address in `DEK_PUB_OPERATORS` may always make an account.** `mayJoin` takes the operators beside the invited (ADR 79): a verified address among them may join, though `DEK_PUB_INVITED` leaves it out. An operator thus needs no invitation of their own, and a sign-in link is mailed to their address as to an invited one.
- **An operator may do nothing else here.** They cannot open a talk that is not theirs, nor change one. Deleting is all a takedown needs. ADR 85 adds one more power: inviting people to sign up.
- **An operator's deletion is logged** through `log` (`src/common/log.ts`), as `an operator took a deck down`, with the deck's ID, the owner's account ID and the operator's account ID. It logs no handle, title or address.

**`dekc pub delete [deck] --yes` deletes the deck that `pub:` names.** Its owner runs it in the project, as they run `share` and `status`.

- **`--yes` is required.** Without it nothing is sent. The error says which deck would be deleted, and its hint gives the command with the deck's name, shell-quoted, and `--yes`: `dekc pub delete b --yes`. A hint without the name would delete the deck of the folder it is run in, which, run from `decks/a` after `dekc pub delete b`, is `a`. `dekc pub share`'s hint without a setting names the deck to `dekc pub status` the same way. The command runs without a terminal, so it never asks a question. An agent reads the error, and a person or an agent confirms by running the command again. `--yes` is a new flag, taken by `delete` and `takedown` alone.
- **After the deletion, `pub:` is taken out of `script.md`.** Every other byte stays as it was (`withoutFrontmatterKey`, beside `withFrontmatterKey`). `changed` names `script.md`, to commit, as `publish` does when it writes `pub:`. The next `dekc pub publish` then makes a new deck at the same slug. Left in place, `pub:` would make the next publish get a 404 for a deck that is gone.
- **A deck dek.pub does not have, or that is not the caller's, is refused, and `pub:` is left as it was.** A command that fails changes nothing. The hint for a 404 from any `dekc pub` command run in a project now also says that a deck deleted from dek.pub is gone, and to take `pub:` out to publish it as a new one. An owner reaches that state after deleting on the manage page, or after a takedown.
- `--json` returns `{ action: "delete", server, id, owner, slug, changed }`.

**`dekc pub takedown <talk> --yes` deletes a talk named by its URL or its deck ID, from any directory.** An operator uses it. The manage page is the owner's alone and gives everyone else a 404, so an operator has no page of their own; the command is their only way in.

- **It is a separate subcommand, not a form of `delete`.** `delete` names a deck of the project it runs in, and the CLI resolves that deck before the command runs. A takedown has no project. Two subcommands also say in the command line, in help and in the docs which act is meant.
- **`<talk>` is a deck ID, `d_…`, or the talk's URL on the server asked**, `/@handle/slug`, with or without `?key=`. A report of abuse comes with a URL, so the URL is enough. A URL on another server, or one that names no talk, is refused before anything is sent.
- **A URL is turned into a deck ID by `GET /api/people/:handle/talks/:slug`** (`paths.talk`). It answers `DeckFound`, `{ id, owner, slug }`, which the protocol gains, to its owner or an operator, and a 404 to anyone else. It answers nothing that opens the deck: `DeckStatus` would carry a `link` talk's key in its `url`, and an operator, who may not open the talk, would be handed it.
- **A 404 has a hint of its own**: only the talk's owner or an operator of the dek.pub can take it down, so check the talk's URL or deck ID, and that `dekc pub whoami` names one of them. The hint other `dekc pub` commands give for a 404 is about `pub:` in `script.md`, and a takedown has no project.
- `--json` returns `{ action: "takedown", server, id, owner, slug }`. No file is changed. The owner may run it too, on their own talk.

**The manage page has Delete talk at its bottom.** A button opens a dialog that says what goes and that it cannot be undone. Its Delete for good button is enabled only once the talk's slug is typed into the field, as GitHub asks for a repository's name before deleting it. There is no Undo. Once the talk is deleted, the page goes to the owner's profile.

**`PROTOCOL_VERSION` stays 2.** A new route, a new method on a route, and a new answer change nothing an older dekc sends or reads.

**What was not chosen:**

- **A soft delete**, with a `deleted_at` column and a purge later. The talk could be brought back, but every query would have to leave deleted decks out, and the data would stay after the person was told it was gone. An owner who deletes means it, and the dialog asks for the slug first.
- **Deleting the R2 files before the rows**, so that a failure could be retried while the deck still exists. Between the steps, the talk page would show a deck whose files are gone. The failure that order guards against costs only storage, unless the access file is left, which steps 1 and 3 guard against instead.
- **Deleting the files after the answer, with `waitUntil`.** The answer would come sooner, but a failure would be logged where no test sees it, and the end-to-end run could not check R2 right after the delete. A deck keeps one version, so there are few files to delete.
- **Foreign keys with `ON DELETE CASCADE`.** SQLite cannot add a foreign key to an existing table without rebuilding it, and D1 needs `PRAGMA foreign_keys` on for every connection. A list held to the schema by a test does the same job.
- **Operators named by handle, by user ID, or by `@<GitHub login>`**, as `DEK_PUB_INVITED` may name people. A handle can be squatted, a user ID cannot name someone who has no account yet, and a GitHub login can pass to someone else, as said above.
- **Answering an operator differently for a talk that does not exist.** An operator gets the same answers as anyone else, apart from being allowed to delete.

## Consequences

- An owner can take a talk back, from the CLI or the manage page, and publish again at the same URL as a new deck. Nothing of the old one carries over: not the threads, the likes, the grants or the link key.
- A deletion cannot be undone, by the owner or by whoever runs dek.pub. The only way back is D1's Time Travel, with R2 as it is, which nothing has tried yet.
- A file that a failed step 4 left in R2 stays there unseen, and only the log shows it. If that happens often, a sweep of the `decks/<id>/` prefixes with no `decks` row is needed. An access file left so, which only a racing write and a failed sweep together leave, keeps serving what it opens until it is deleted by hand; its log line names the deck.
- An operator can delete anyone's talk without opening it, so a mistaken takedown is as final as an owner's own deletion. The log keeps who did it.
- An API key can do whatever its account can. A leaked `DEK_TOKEN` can delete every talk of its owner, and an operator's can take down anyone's talk. An operator's key must never be used in CI; `docs/guide/publish.md` says so where it documents the takedown.
- Production needs `DEK_PUB_OPERATORS` set with `void secret put`. On an empty database, the first operator signs up from it alone.
- A new table with rows of a deck has to be added to `DECK_ROWS` and `DECK_TABLES`; the unit test fails until it is.
- `dekc pub delete`, `dekc pub takedown` and `--yes` are new. Their docs, `llms.txt`, the `--json` schema and the commands' usage name them.
- Deleting an account is still done by hand on request, and has to delete the account's decks with `deleteDeck`.
