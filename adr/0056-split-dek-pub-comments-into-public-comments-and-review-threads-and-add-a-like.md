# 56. Split dek.pub comments into public comments and review threads, and add a like

Date: 2026-11-14

## Status

Accepted

Supersedes [52. Let anyone a dek.pub deck is shared with read its threads](0052-let-anyone-a-dek-pub-deck-is-shared-with-read-its-threads.md)

Amended by [61. Let only signed-in accounts write dek.pub public comments, and drop guests and Turnstile](0061-let-only-signed-in-accounts-write-dek-pub-public-comments-and-drop-guests-and-turnstile.md)

## Context

A dek.pub talk has had one kind of comment: a thread on a slide, an element or a quoted passage, resolved and placed again on each version. Two kinds of readers were mixed in it:

- **The people a deck is shared with,** in client work (ADR 51), who review it slide by slide and resolve what they raise.
- **Anyone a `link` or `public` deck reaches,** whom the deck's comment policy (`off | signed-in | guests`) let open the same threads, guests among them, with a name and Turnstile.

A reader of a public talk wants to say something about the talk, not to file a note against slide 7 of version 3. A review needs to stay among the people it is for. ADR 52 let anyone granted the deck read its threads, `view` as well as `comment`, along with everyone the policy let comment. So on a public deck, a stranger read the client's review.

## Decision

**A talk has two kinds of comment.**

| | Public comments | Review threads |
| --- | --- | --- |
| On | the talk as a whole | a slide, an element, a quote |
| Shown | at the bottom of the talk page | in the review panel beside it |
| Decks | `link` and `public` | every deck |
| Written by | whom the comment policy lets | the owner and anyone granted `comment` |
| Read by | anyone who may open the deck | the owner and anyone granted the deck |

**Review threads are for the people a deck is shared with.** `canComment` is the owner or a `comment` grant, and `canReadComments` the owner or any grant, `view` included. Each reads the threads their side and the version allow (ADR 51, 55). The comment policy has nothing to do with them. A signed-in reader with no grant gets 404 from `GET /api/decks/:id/comments` and 403 from `POST`, and a guest writes no thread. The talk page names the panel "Review" and the button that opens it "Review" with the count of open threads. As ADR 52 decided, `DeckLink` takes `canRead` and `canComment` apart: anyone who may read gets the pins, and only one who may comment may pick an element.

**The comment policy governs public comments only.** Under `signed-in`, anyone signed in who may open the deck posts one; under `guests`, a guest too, with a name and past Turnstile; under `off`, no one, and those there stay readable. A private deck has none. A public comment is plain text on the talk as a whole. A reply answers a top-level comment, never another reply. The list runs oldest first, each reply under its comment. Only its author changes a comment, and `editedAt` says when they last did. Its author or the deck's owner removes it, and its replies go with it. The routes are `GET`/`POST /api/decks/:id/public-comments` and `PATCH`/`DELETE /api/decks/:id/public-comments/:comment`. The protocol gains `PublicComment`, `PublicReply`, `NewPublicComment` and `EditPublicComment`; only the pages use them.

**A like is one signed-in account's, once, on a `link` or `public` deck, and it can be taken back.** `PUT` and `DELETE /api/decks/:id/like` answer `LikeState` (`count`, `liked`). Anyone who may open the deck sees the count. The button is a heart beside "Share" on the talk page, and sends a reader who is not signed in to sign in. It is called "Like" (いいね) for now; another name would change nothing of how it works.

**What was not chosen:**

- **Keeping review threads open under the policy,** as before. A review would then be public on every public deck.
- **Public comments on a slide.** That is what a review thread is; a public comment is about the talk.
- **Nested replies.** One level keeps the list readable at the bottom of a page.
- **Public comments in `dekc pub comments`,** or mailed to the owner. The CLI and the mail are for the review (ADR 54).
- **A second policy key for review threads.** Who reviews is said by the grants already.

## Consequences

- The schema gains `public_comments` and `likes`, with their migration.
- The review routes no longer admit guests. `NewComment` and `NewReply` keep their optional `guestName` and `turnstile`, now refused before they are read.
- Who may read and write review threads changes on `link` and `public` decks: a signed-in reader without a grant loses them. Comments are not deployed yet, so no one loses a thread they wrote.
- `--json` is unchanged: `dekc pub comments` lists the review threads, and they are what it always listed for the owner.
- The manage page's policy hints say the policy is about the comments below the talk, and that review threads are for the people the deck is shared with.
- The e2e round trip checks that:
  - a signed-in reader with no grant reads and writes no review thread until granted;
  - a public comment is posted, replied to once, changed by its author alone, and removed by the owner with its reply;
  - with the policy off, no one posts, and under `guests` a guest does;
  - each account likes a talk once and may take it back, and a guest cannot like;
  - a private talk has no public comments.
