# 61. Let only signed-in accounts write dek.pub public comments, and drop guests and Turnstile

Date: 2026-11-14

## Status

Accepted

Amends [56. Split dek.pub comments into public comments and review threads, and add a like](0056-split-dek-pub-comments-into-public-comments-and-review-threads-and-add-a-like.md)

Amends [47. Put a talk on dek.pub with the dekc pub commands](0047-put-a-talk-on-dek-pub-with-the-dekc-pub-commands.md)

Amends [43. Build dek.pub as a Void app and a serve Worker, checked on Miniflare](0043-build-dek-pub-as-a-void-app-and-a-serve-worker-checked-on-miniflare.md)

## Context

ADR 47 gave `dekc pub share` the comment policy `--comments off|signed-in|guests`, and ADR 56 kept `guests` for the public comments at the bottom of a talk: a reader with no account posted under a name they typed, after Cloudflare Turnstile's human check. ADR 43 lists `TURNSTILE_SECRET` among the production settings. `dekc` v0.6.4 shipped the `guests` value.

A comment with no account behind it is a comment no one owns:

- Its writer cannot change or remove it, since both need the account that wrote it (ADR 56).
- No mail reaches its writer (ADR 54), and nothing ties it to their other comments.
- Its name is whatever was typed, so anyone may post as anyone on a public page.
- A like already needs an account, so a guest could comment on a talk but not like it.

Turnstile was set up only in part. The site key the widget needs was in neither `dev.env` nor ADR 43's list of production settings, and the server asked for a token whenever its secret was not `off`, so with the secret set and no site key a guest could not comment at all. Nothing exercised the check itself.

A reader signs up with GitHub, and someone a deck is shared with by email signs in by a mailed link (ADR 53). Nothing is deployed, so no comment, deck setting or reader is lost.

## Decision

**Only a signed-in account writes a comment.** The comment policy is `off | signed-in`: under `signed-in`, anyone signed in who may open a `link` or `public` deck posts a public comment; under `off`, no one. Someone signed out never posts, whatever the policy. `POST /api/decks/:id/public-comments` answers them `403 no_comments` with the hint "sign in to comment" under `signed-in`, and with no hint under `off`. The talk page shows them the sign-in button in place of the composer, as it did under `signed-in`. Review threads were already for the owner and the deck's `comment` grants only (ADR 56).

**Every author is an account.** The protocol's `Author` is `{ name, handle }`, both always there; `guest` goes. `NewComment`, `NewReply` and `NewPublicComment` lose `guestName` and `turnstile`; on the first two, ADR 56 had kept them and refused them. As strict shapes, all three refuse a body that still sends them. Removing a field from an answer is what `PROTOCOL_VERSION` is bumped for, so it is 2, and `dekc` sends `dek-protocol: 2`.

**`dekc pub share --comments` takes `off` or `signed-in`.** `--comments guests` is a usage error from the flag table, `invalid --comments "guests"`, with the values it takes in the hint, and nothing is sent.

**Turnstile goes:** the widget, the server's check, `TURNSTILE_SECRET` and `TURNSTILE_SITE_KEY`. So does the composer's name field and the name it kept in the browser.

**The store follows.** `decks.comments` holds `off` or `signed-in`. `threads`, `replies` and `public_comments` lose `guest_name`, and their `author_id` is `NOT NULL`. The migration first sets a deck under `guests` to `signed-in`, and deletes every row with no author, with the replies under it, so it applies to a development database that has them.

**What was not chosen:**

- **Finishing Turnstile and keeping guests.** It would close the setup gap and leave every other one: a comment its writer cannot change, a writer no mail reaches, and a name anyone can take.
- **Keeping `guests` and reading it as `signed-in`.** `dekc` would accept a setting that does nothing, and an agent would be told it took.
- **Keeping `guestName` and `turnstile` in the request bodies, ignored.** A client that sends them would believe they count. A strict body says plainly that they do not.
- **Sending `guest: false` on every author,** so that an older `dekc` still reads it. The field would say nothing, forever. No dek.pub is deployed for an older `dekc` to talk to, and the error it gives already says to update dek (ADR 47).
- **Leaving `PROTOCOL_VERSION` at 1.** The protocol's own rule bumps it when a field leaves an answer, and protocol 1 would then name two shapes.

## Consequences

- `dekc pub share --comments guests` is refused, and a comment's `author` in `--json` always has a `handle` and no longer has `guest`. The commit is marked breaking, and `scripts/schema-compat.ts` lists the narrowing.
- A `dekc` from before this sends `dek-protocol: 1`, which this server takes, and then cannot read a comment's author; it says so, with updating dek as the hint. This `dekc` against a server of protocol 1 is told the server speaks an older protocol before anything runs. ADR 48's `dek-protocol: 1` is now `2`; its decision stands.
- Production needs neither `TURNSTILE_SECRET` nor a site key; ADR 43's other settings stand. `dev.env` and the e2e server lose `TURNSTILE_SECRET`.
- A notice mail always names an account as the one who acted (ADR 54).
- Signing in is the only gate on posting. Rate limits and a way to report a comment are still missing.
- `Avatar`'s outline look stays for someone invited by email who has no account yet, under the prop `pending`.
- `tests/unit/comment.test.ts` checks that someone signed out posts under no policy. The e2e round trip checks that a signed-out `POST` is refused with 403 and the sign-in hint, that someone signed out cannot like, and that `dekc` refuses `--comments guests`. `tests/cli/pub-deck.test.ts` checks the usage error without the server.
- ADR 56's other decisions stand: the two kinds of comment, the routes, the like.
