# 73. Claim a dek.pub grant by address when its holder signs in or when it is made, not when a deck is read

Date: 2026-11-14

## Status

Accepted

Amends [53. Send dek.pub's mail through Void and sign in by a mailed link](0053-send-dek-pub-s-mail-through-void-and-sign-in-by-a-mailed-link.md)

## Context

ADR 53 lets an owner share a deck with an email address, and `visibleDeck` claims that grant for an account once someone signs in having verified the address. A claimed grant names the account, so it holds even if the address changes later, and the manage page shows it by handle rather than by address.

`visibleDeck` runs on every read: the talk page, its pictures, the GETs of comments and public comments, and every POST that writes a comment. So a GET could write to D1. It wrote only while a grant was waiting, but which read would be the one that writes was up to the reader. Until the grantee opened that deck, the owner saw them by address even after they had signed in.

`grantsOf` already counts a grant by an address the reader has verified, claimed or not. The claim adds nothing to what anyone may open; it only ties the grant to the account.

## Decision

**A grant by address is claimed at two moments, and reading a deck never claims one.**

- **When someone signs in.** Better Auth's `session.create.after` hook, in `auth.ts`, calls `claimOnSignIn` in the sign-in feature. If the account has verified its address, every grant waiting on that address, on any deck, is tied to it. GitHub sign-in, a sign-in link (which verifies the address before the session is made) and the device flow all make a session, so all three claim.
- **When the grant is made to an address an account has verified already.** `share` looks the address up after it writes the grant, and claims it for that account on that deck, unless the account is the owner's. The answer then names the grant by handle, as `Grant.who` says.

**`claimGrants(person, deckId?)` is one UPDATE.** It sets `user_id` on the grants with the person's address and no account, except on a deck where the account already holds a grant by handle: one account can hold only one grant on a deck. The grant by address beside it keeps waiting, and still counts while the address is theirs. Being one statement, it never binds more values than D1 allows, however many decks are waiting. An account whose address is not verified claims nothing, as before.

**`visibleDeck` only reads.** It no longer claims, and `waitingGrants` goes with that call; the rule it held is in the UPDATE's condition.

**What was not chosen:**

- **Claiming at read time, but only on page loads.** A page load is still a GET, and which deck gets read first would still decide when the owner sees the handle.
- **Claiming only at sign-in.** A grant made after its holder signed in would wait until their next sign-in, so the owner would see the address all that time.
- **Dropping the claim and matching grants by address alone.** A grant would then follow the address, not the person: if the account's address changed, the grant would be lost, and anyone who later verified the old address would gain it.

## Consequences

- No GET from a reader writes to D1 through grants. Better Auth's API key plugin still records each use of a key, which is a gap of its own.
- Each sign-in runs one UPDATE more. It touches no row when nothing waits.
- The owner sees a grantee by handle from the moment they sign in, or from the moment the grant is made when the address already has an account.
- The e2e run checks that a sign-in by link claims the grant before any deck is read, that a grant by a verified address is claimed when it is made, and that a grant by address beside one by handle on the same deck keeps waiting.
