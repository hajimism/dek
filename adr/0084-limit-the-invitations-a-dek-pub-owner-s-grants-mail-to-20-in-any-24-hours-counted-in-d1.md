# 84. Limit the invitations a dek.pub owner's grants mail to 20 in any 24 hours, counted in D1

Date: 2026-11-14

## Status

Accepted

Amends [75. Manage a dek.pub deck's grants with dekc pub grants, add and remove](0075-manage-a-dek-pub-deck-s-grants-with-dekc-pub-grants-add-and-remove.md)

## Context

An owner shares a deck with anyone, by handle or by email address, on the manage page or with `dekc pub grants add` (ADR 75). Each new grant mails an invitation, `invitationMail`, with the owner's name and the deck's title, and the owner chose both. A grant by handle mails the person's address. A grant by address mails that address, and since ADR 79 that address may then make an account. A change to a grant mails nothing. A grant removed and made again is a new grant, so it mails again.

Nothing limited how many. Anyone invited could make dek.pub mail strangers words of their own choosing, as often as they liked. That is spam sent in dek.pub's name, and it would cost the sending domain its reputation, which every sign-in link and reply notice depends on.

Better Auth's rate limits keep their counts in memory. On Workers each isolate counts alone, so a limit that holds has to count in D1. The `grants` table cannot be the count. It holds the grants that are there now, not the mail sent: removing a grant and making it again would free its slot, and deleting a deck would take its grants away (ADR 82).

## Decision

**An owner's new grants mail at most 20 invitations in any 24 hours, over all their decks.** The constants are `INVITATIONS_PER_WINDOW = 20` and `INVITATION_WINDOW_MS`, beside the rules in `src/model/deck/grant/grant.ts`. The window rolls, so each invitation stops counting 24 hours after it was sent, not at midnight. Twenty is more than a talk under review is shared with in a day. It still lets an invited beta user hand a deck to a meetup's speakers or a client's team over a day or two.

- **What mails, counts.** Every new grant takes an invitation, whether it is by handle or by address. A grant by handle mails a person who has an account, but it is still mail with the owner's words in it. A change of role or side mails nothing, takes nothing, and works past the limit.
- **A grant removed and made again counts again**, since it is mailed again.

**One table, `invitations`, records each invitation by who caused it and when**: `inviter_id`, `created_at`, and an index on both. It holds no deck and no address. The count needs neither, and so the table keeps nothing about the person mailed beyond what the grant already holds. It has no `deck_id`, so it is not in `DECK_ROWS` or `DECK_TABLES` (ADR 82). Deleting a deck therefore leaves its invitations counted, and the count cannot be reset by deleting a deck and making another. Rows outside the window serve no purpose. Each new invitation deletes its inviter's rows that have left the window, so an inviter has at most about 20 rows.

**`share` takes the invitation before it makes the grant**, when the deck has no grant yet for that person. `takeInvitation` in `src/model/deck/grant/store.server.ts` runs one batch:

1. It deletes the inviter's rows that have left the window.
2. It runs `insert into invitations select … where (select count(*) … in the window) < 20`.

The count and the insert are one statement, so requests that arrive together, on any isolate, cannot pass the limit together. When the insert writes no row, nothing is made and nothing is mailed. A grant that a request racing with it made first still spends the invitation, which errs on the side of sending less.

**Past the limit the answer is a 429, `invitations_exhausted`:**

- The message says that the owner's shares mailed 20 invitations in the last 24 hours, as many as dek.pub sends for one person.
- The hint says to share with someone new after a time, written as `2026-11-15 09:13 UTC`. The time is rounded up to the minute, so it is never too early. It also says that a change to a share mails nothing and can be made now.
- The time is when enough invitations have left the window to bring the count under the limit: `invitationsFreeAt`. The 429 is the first use of the status that `ApiError` already allowed.

**Both clients show the hint.**

- **`dekc pub grants add`** already printed a server's hint as `help:`, and as `error.hint` with `--json`; nothing in it changes. It takes one `who` at a time, so there is no batch to make all-or-nothing.
- **The manage page's sharing form** shows the hint under the message. The page's API client, `ApiFailure`, now keeps the hint of any error it is answered with. Before, it kept only the message, so the form also dropped the hint of `no_such_person`, to share by address instead. It still shows the server's words, in English, as it does for every other error.

**`PROTOCOL_VERSION` stays 2.** `ErrorBody` is unchanged, and a new status and code with a hint is what an older dekc already prints. No `--json` shape changes.

**What was not chosen:**

- **Counting the rows of `grants`.** It counts grants, not mail. A grant removed and made again, or a deck deleted, would free its slots.
- **Keeping the deck or the address in `invitations`.** With `deck_id` the table would belong in `DECK_ROWS`, and deleting a deck would reset the count. An address would keep, past its grant, a record of a person who never signed up.
- **Counting first and writing after, in two statements.** Requests sent at once would all read the same count and all pass it.
- **A cap on the grants of one deck**, such as 100 by address. The harm is the mail, and the window already bounds it whatever the number of decks. A cap per deck would bound nothing an owner cannot get around with a second deck.
- **Granting past the limit but mailing nothing.** The person would be shared with and never told, and the owner would not know which.
- **A `Retry-After` header, or a time field in `ErrorBody`, for the page to show the time in the reader's language.** It would change the protocol to translate one message. The page already shows the server's English for its other errors.
- **Better Auth's rate limit, or a Durable Object.** The first counts in memory, isolate by isolate. The second is a new binding for something D1 already counts exactly.

## Consequences

- No one person can make dek.pub send more than 20 invitations in a day, so the mail an invited person can send through it is bounded.
- An owner who shares a deck with more than 20 people in a day has to wait for the rest. The answer says until when, and changes to grants already made still work.
- `invitations` is the first table keyed by a person that a deck's deletion leaves alone. Deleting an account, still done by hand, has to delete its rows by `inviter_id` too.
- The manage page now shows the hint of every error the sharing form is answered with, so `no_such_person`'s advice to share by address shows too.
- The limit is a constant. Raising it for one person, or for everyone once dek.pub opens to anyone, is a change to the code, recorded in its own ADR.
- The limit counts only invitations. Sign-in links, reply notices and the rest of dek.pub's mail have no limit of their own; the list of what dek.pub lacks names them under Rate limits.
