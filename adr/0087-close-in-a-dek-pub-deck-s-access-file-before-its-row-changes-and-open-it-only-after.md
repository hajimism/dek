# 87. Close in a dek.pub deck's access file before its row changes, and open it only after

Date: 2026-11-15

## Status

Accepted

Amends [50. Organise dek.pub's code by the model a person deals with](0050-organise-dek-pub-s-code-by-the-model-a-person-deals-with.md)

## Context

The serve Worker reads no database. It hands out a deck's builds by the access file the app writes beside the deck in R2, `decks/<id>/access.json`, which says whether the deck is `public`, whether its script is, and whether any page may frame it (ADR 43). Every change an owner makes goes through `updateDeck`, which wrote the deck's row in D1 and then wrote the file again from the row (`syncAccess`). Recording a version writes the file too, so a write that failed after D1 changed was put right by the next version (ADR 50).

Between those two writes, and for as long as a failed second write lasts, the file says what the row said before. For a change that opens a deck, that is harmless: the file is narrower than the row, and the deck stays closed until the next change. For a change that closes one, it is the opposite. An owner who makes a public deck private, or hides its script, or stops it being framed, is told the change is saved, and the serve Worker goes on serving the deck to anyone, with its script and in any page, until the deck changes again or a version is published. Nothing tells the owner.

The access file is the only thing the serve Worker trusts, so it has to fail closed: it may for a moment hand out less than the row allows, never more.

## Decision

**`updateDeck` closes in the access file before it writes the row, and opens it only after.** When a patch touches a column the file is made from (`visibility`, `scriptPublic`, `embed`), the deck's store makes three writes, in this order:

1. `narrowAccess` writes the file the row gives with only what the patch closes taken away: the narrower of the file before and the file after (`narrowing` in `deck/serving/access-file.ts`). `visibility` stays `public` only if both are; `scriptPublic` and `embed` stay on only if both are. A patch that closes nothing writes nothing here.
2. The row is written.
3. `syncAccess` writes the file the row now gives, as before.

A failure at step 1 throws before anything has changed, so the request can be made again. A failure at step 2 or 3 leaves the file narrower than the row, never wider, until the next change or the next version writes it again. A change that both closes one thing and opens another, such as hiding the script while allowing framing, closes at step 1 and opens at step 3.

Both writes read the row from D1 and replace the file only if it has not changed since they read it, as `syncAccess` did, so of two changes at once the later state still stays. Step 1 computes the narrowing from the row it reads, not from the deck the request loaded, so it never closes in from a stale state. The retry on a lost race is `untilWritten` in `src/common/until-written.ts`, which knows nothing of decks.

Recording a version and creating a deck keep their order: they write the row, then the file. Neither can open more through a failed write. A new deck is `team` and has no file until its first write, and the serve Worker hands out nothing without one. A new version's file names the new version as current, and the old one's files are deleted after, so a file left naming the old version opens a build that is going away.

**Rejected:**

- **Writing the file first and the row second for every change.** A change that opens a deck would then open it in R2 before D1 says so, and a failed row write would leave it open with nothing in the app saying it is.
- **Undoing the row when the file write fails.** A second D1 write can fail too, and a concurrent change may have written the row in between, which an undo would overwrite.
- **Having the serve Worker ask the app.** The serve Worker reads no database and no cookie by design (ADR 43); a call back to the app would put the app on the path of every deck page and its embeds.

## Consequences

- No failed write, at any step, leaves the serve Worker serving a deck, its script, or a frame of it that the row no longer allows.
- A change that closes something costs one more R2 write, and a read of the row.
- A failure at step 2 or 3 leaves a deck closed that the row says is open, until the next change. The owner sees the deck as they set it on the manage page, and readers get a 404 for its frame. Changing any setting again, or publishing, puts it right.
- Two changes made at once can still leave the file wider than the row in one case: a change that opens a deck writes the file between another's step 1 and step 2, and that other change then fails at step 3. The file then says what the row said before the failing change, until the next one.
- `narrowing`, `serving` and `untilWritten` are pure, and unit tests hold them, including a check that nothing written at step 1 serves more than the file before or after it would. The order of the three writes is held by tests against D1 and R2 that make a write to R2 fail (ADR 88).
