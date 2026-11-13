# 52. Let anyone a dek.pub deck is shared with read its threads

Date: 2026-11-13

## Status

Accepted

## Context

A grant on a dek.pub deck is `view` or `comment`. Today only those who may comment read the deck's threads: `canReadComments` is the owner, or anyone `canComment` allows. On a `private` deck, `canComment` allows only the owner and `comment` grantees. So a person granted `view` opens the deck but sees none of its threads.

In client work that is backwards. A client stakeholder who only approves, or a team member who only follows the review, needs to read what was said without writing. A `view` grant is the way to give someone the deck without letting them write, and it is also the obvious way to let them follow the review.

On the page, `DeckLink` sends the deck the pins to draw, and hears a click on one, only for someone who may comment. That kept pins away from anyone who could not read the threads, but it ties reading to writing too.

## Decision

**Anyone who holds a grant on a deck reads its threads**, `view` as well as `comment`, along with the owner and anyone the comment policy lets comment. They read the threads their side may (ADR 51) on the versions they may (`canSeeThread`). Writing is unchanged: a `view` grantee cannot open a thread or reply, and the page shows them no composer.

**The page separates reading from writing.** `DeckLink` takes `canRead` and `canComment`. With `canRead` the deck draws the pins and a click on one selects its card. With `canComment` the reader may also pick an element to comment on. The talk page passes `canRead` when the loader gave it comments, so the deck shows nothing the API would not.

**What was not chosen:**

- **A third role, `read`, between `view` and `comment`.** It would make the owner choose between three grants where two are enough. Opening a deck in a review and not seeing the review is not a useful grant.
- **Showing a `view` grantee the threads but not the pins.** The pins are where the threads are on the slide; without them a card is harder to follow, and they show nothing the cards do not.

## Consequences

- `canReadComments` is true for any grant. `GET /api/decks/:id/comments` answers a `view` grantee instead of 404, and the talk page gives them the comments panel and the pins, without a composer.
- The e2e round trip checks that a colleague granted a view reads the comments, and the `DeckLink` browser test checks that a reader who may not comment still gets marks and cannot pick.
- A `view` grant on the client's side reads shared threads only. Giving someone `view` no longer means they see nothing of the review, so an owner who wants to keep a thread from a grantee keeps it to the team or does not share the deck with them.
