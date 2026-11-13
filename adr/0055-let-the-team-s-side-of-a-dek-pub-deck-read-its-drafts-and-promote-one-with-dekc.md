# 55. Let the team's side of a dek.pub deck read its drafts, and promote one with dekc

Date: 2026-11-14

## Status

Accepted

## Context

`dekc pub publish --no-promote` uploads a version without making it the one readers see. Until now such a version was the owner's alone. Only the owner could read it, its pictures and the threads on it, and the talk page showed it to them only while no version was current. So the owner could not open a draft on the page once an earlier version was current, and the rest of the team could not open one at all.

In client work, the team prepares a version before the client sees it: the team reads the draft and comments on it, and the owner promotes it once it is ready. The client is meant to read the current version, and nothing else.

What shapes the change:

- **Each grant has a side** (ADR 51), and `visibleDeck` answers it with the deck. The owner is always on the team's side.
- **`canSeeThread` keeps the version rule as a clause of its own** beside the scope rule, so that the version rule can change on its own (ADR 51).
- **The serve Worker hands out any version the app signs a token for**, whether or not it is current. `frameOf` signs one for any version that is not open to everyone.
- **Promoting is a POST to `/api/decks/:id/promote`** that only the owner may make, and the manage page's "Make current" calls it. The CLI has no command for it.

## Decision

**A version not yet current is a draft, and the team's side reads it.** `mayReadVersion(deck, side, n)` lets the team's side read any version uploaded, and the client's side the current one only. It decides the talk page, the pictures (`/i/:id/:n/:name`), `GET /api/decks/:id/comments?version=` and which version a new thread may be opened on. A version someone may not read is a 404, the same as a deck they may not see.

**The team's side chooses the version on the talk page.** `?v=<n>` asks for a version; `shownVersion(deck, side, asked)` gives the team's side any it may read, and the client's side the current one, with any other `?v=` missing. Without `?v=`, the team's side gets the current version, or the newest while none is current. `Talk` gains `current` and `versions`, the latter for the team's side only. The page then shows a picker above the deck, and says when the version shown is a draft or older than the current one. A draft's page is never indexed. The manage page links each version to the talk page on it.

**A thread on a draft is the team's until its version is current.** The version clause of `canSeeThread` becomes `side === "team" || n <= current`. A shared thread opened on version 5 reaches the client's side once version 5 or a later one is current, even if a version between them is never promoted. Mail follows the same check, so the client's side is never mailed of a draft (ADR 54). `canSeeThread` no longer takes the person: the owner's rights come through their side.

**`dekc pub promote [deck] <n>` makes version `n` current**, as the manage page does. Only the owner may. `n` must be a whole number, and anything else is refused before anything is sent. It prints the deck as `status` does, under `"action": "promote"`.

**What was not chosen:**

- **Drafts for the owner alone**, as before. The team that reviews a version before the client is the reason for drafts.
- **A role that may promote,** given to the team's side. Making a version current is what the client sees. It stays with the owner, as publishing does.
- **Promoting from the talk page.** The manage page and the CLI do it; the talk page is for reading.
- **A `dekc pub versions` command.** `dekc pub status` lists the versions already.
- **Keeping which versions were once current,** so that the client's side could comment on an older one. Nothing needs it yet.

## Consequences

- `mayReadVersion`, `shownVersion` and `canSeeThread` take the side instead of the person. Their callers already had it from `visibleDeck`.
- `--json` gains the `promote` action. Nothing is taken away or loosened, so it is not breaking (ADR 31). `docs/public/cli.schema.json` and `llms.txt` are regenerated.
- The e2e round trip checks that:
  - the team's side opens a draft with `?v=`, and the client's side gets a 404;
  - a shared thread on a draft stays from the client's side;
  - `dekc pub promote` makes the draft current, and the client's side then reads the version and the thread.
