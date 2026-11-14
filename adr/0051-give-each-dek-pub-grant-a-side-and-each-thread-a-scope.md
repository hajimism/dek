# 51. Give each dek.pub grant a side and each thread a scope

Date: 2026-11-13

## Status

Accepted

Amended by [64. Call the side of a dek.pub deck that is not the team its guests, and share a thread with them by a checkbox](0064-call-the-side-of-a-dek-pub-deck-that-is-not-the-team-its-guests-and-share-a-thread-with-them-by-a-checkbox.md)

## Context

dek.pub is meant for client work: a team makes a deck, and reviews it with a few people at the client. The two sides write different things. The team notes what it has not settled yet and what it has not told the client. The client asks and approves. Today every thread is read by everyone who may read the deck's comments, so a team that wants to talk among itself has to do it somewhere else.

What shapes the change:

- **A grant says only `view` or `comment`.** It does not say who the person is to the work. The owner is one account, so the team's other members are grantees like the client.
- **A thread's number is a count of the deck's threads.** `#N` is on every card, on the article's pins, and on the pins the deck draws (ADR 45), and `dekc pub comments reply 3` takes it. If a thread the client may not see took a number from the same count, the client would see the gaps and know that such threads exist.
- **The deck draws a pin's number as a whole number** (`docs/reference/embed.md`). A label such as `T3` cannot reach the pins the deck draws without a change to dek's runtime and a release.
- **Grants can overlap.** A person can hold one grant by account and another by an email address they have verified. Roles already resolve by taking the one that allows more.
- **The comment policy (`off | signed-in | guests`) lets people with no grant comment** on a `link` or `public` deck.
- **Comments are not deployed**, so no stored thread has to keep its meaning.

## Decision

**A grant has a side, `team` or `client`.** A new grant is on the client's side unless the owner chooses the team. A change to an existing grant leaves its side alone unless it names one. The owner is on the team's side, worked out from ownership and never stored. Anyone else, guests and signed-in readers with no grant included, is on the client's side. Of the grants one person holds, the side that sees more counts, as the role that allows more does. `Grant` and `NewGrant` gain `side`, and the manage page's sharing form chooses it next to the role.

**A thread has a scope, `team` or `shared`.** The team's side reads both. The client's side reads shared threads only, and a team thread is to them as missing as one that does not exist: the list leaves it out, counts and pins count only what is listed, and replying to it, resolving it or sharing it answers 404. Replies have no scope of their own and are read with their thread. `canSeeThread` checks the side as a clause of its own beside the version clause, so the version rule can change without touching this one.

**Who opens a thread sets its scope.** `NewComment` gains an optional `scope`. On the team's side it defaults to `team`, so a thread posted without a choice stays inside the team. On the client's side it is always `shared`, and asking for `team` is refused with `403 team_only`. The page's composer shows the choice to the team's side every time, set to the team's scope, and shows nothing to the client's side.

**A team thread can be shared, and a shared thread is never narrowed.** `POST /api/decks/:id/comments/:comment/widen` makes a team thread shared. The owner and the thread's author may do it, as they may resolve it. Sharing a thread that is already shared changes nothing and answers the thread. There is no route to narrow a thread: once the client has read it, taking it back would only hide it from them.

**Each scope is counted on its own.** Shared threads take their numbers from `decks.next_thread`, and team threads from `decks.next_team_thread`. A shared thread is labelled with its number, `3`, and a team thread with `T` before it, `T3`. A team thread that is shared takes the next shared number, so the client's count has no gap. `CommentRow` gains `scope`, and `number` stays a whole number counted per deck and scope. `dekc pub comments` prints the label, and `reply`, `resolve` and `reopen` take `3`, `#3`, `T3` or `t3`. The label and the parser are in `src/pub/thread.ts`, without zod, so the pages and the CLI share one definition. The pins the deck draws still show the bare number, so on the team's side a team thread's pin and a shared thread's pin can show the same number.

**Threads are listed in the order they were opened**, by `created_at`, since the numbers no longer give one order across both scopes.

**What was not chosen:**

- **One count for both scopes, accepting the gaps.** It is less work, but the gaps tell the client that team threads exist, which is what the scope is for.
- **No number for a team thread until it is shared.** `CommentRow.number` would become nullable. That loosens what `dekc pub comments --json` prints, which ADR 31 counts as breaking, and the team could not refer to its own threads by number.
- **Numbering threads per reader**, by their place in what that reader sees. Then one shared thread would have a different number for the team than for the client.
- **Sending `T3` to the deck's pins.** The embed API takes a number, and a deck built with an earlier dek would drop the message.
- **A side stored for the owner**, or a grant for the owner. The owner's side follows from owning the deck, and a stored value could disagree with it.

## Consequences

- The schema gains `grants.side` (default `client`), `threads.scope` (default `team`) and `decks.next_team_thread`, and `threads_deck_number` is unique over the deck, the scope and the number. The migration drops and remakes that index, which Void counts as destructive, so the file carries `-- void:allow-destructive`. No row is lost.
- `visibleDeck` answers the side with the deck and the role, and every thread read and write takes it, so no route can list or reach a team thread without saying whose side it is for.
- A signed-in stranger who comments on a `link` or `public` deck is on the client's side. They no longer see the owner's notes, which now default to `team`. An owner who wants a note seen by readers chooses `shared`, or shares the note later.
- `--json` gains `scope` on each comment. Nothing is taken away or loosened, so it is not breaking (ADR 31).
- On the team's side, a pin the deck draws for a team thread can show the same number as one for a shared thread until the embed API carries a label. The cards and the article's own pins show `T3`.
- The client cannot see who else is invited, since only the owner reads the grant list. They see the names of the people who wrote in threads they can read.
