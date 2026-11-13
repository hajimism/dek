# 53. Send dek.pub's mail through Void and sign in by a mailed link

Date: 2026-11-13

## Status

Accepted

## Context

dek.pub is meant for client work (ADR 51), and the people at the client are not developers. Three things need mail:

- **Sign-in.** Today the deployed app has one way in, GitHub. A client stakeholder seldom has a GitHub account and should not need one to read a review. Email and password sign-up exists only where `DEK_PUB_DEV_LOGIN` is 1.
- **Invitations.** An owner can share a deck with an email address that has no account yet; the grant waits, and `visibleDeck` claims it once someone signs in having shown they own the address. Nothing tells the person at that address.
- **Notices** of what happens in a thread (ADR 54).

The choices for sending:

- **Void's `sendEmail`** (`void/email`), which is Cloudflare Email Sending once deployed. It needs no key of its own and no HTTP client. The dev server keeps every mail in an inbox at `/__void/inbox` instead of sending it, so the end-to-end run can read a mail and follow its link. `void.config.ts` names the sender, and `void deploy` sets up the domain for it. To send to any address, the Cloudflare account needs Workers Paid and Email Sending onboarding; on Workers Free it sends only to addresses verified in Email Routing.
- **Resend**, called over HTTP. It is mature and sends to anyone from its free plan, but it is one more provider with a key to keep, and it has no local inbox: tests would stub it.

Better Auth, which Void runs, has a magic link plugin. It mails a link that signs one in once, and makes an account for an address that has none.

## Decision

**dek.pub sends mail through Void's `sendEmail`.** `void.config.ts` sets `email.from` to `dek.pub <noreply@mail.dek.pub>`. `src/common/mail.server.ts` is the one file that calls it. A mail is plain text, in English; each model writes its own mail as a pure function returning `Mail` (`src/common/mail.ts`). A mail that cannot be sent is logged and dropped, and the request that sent it succeeds anyway: the grant is made, and the reply is posted. Mail goes out after the answer, kept alive with the Worker's `waitUntil` (`afterAnswer` in `src/common/http.server.ts`).

**One may sign in by a link mailed to an address that has an account, or a grant waiting for it.** `auth.ts` adds Better Auth's `magicLink` plugin. A link works once, for 15 minutes. `sendMagicLink` looks the address up and mails nothing to any other address. Better Auth answers `POST /api/auth/sign-in/magic-link` the same either way. The lookup and the mail run as a Better Auth background task, so how long the request takes says nothing of the address either. Following the link sets the address as verified, so the next `visibleDeck` claims the grants waiting for it. An address that had no account gets one, with a handle made from the address as email sign-up makes one, and the address's local part as its name. The sign-in page offers the link below GitHub to everyone; a link that has expired or been used sends the reader back there with a message.

**A new grant is mailed to the person it names.** `share` reports whether it made the grant or changed one, and only a grant it made is mailed. A grant to a handle is mailed to that account's address, with the talk's link. A grant to an address is mailed to it, with a link to the sign-in page that leads on to the talk, and says to sign in with that address. The mail says who shared which talk and whether it may be commented on, and never names the side.

**What was not chosen:**

- **Resend.** The second provider and its key buy nothing Void does not give, and without a local inbox the round trip could not follow a real link.
- **A link for any address.** The requirement is that a stranger cannot make an account by mail; GitHub stays the way to sign up for everyone else.
- **A sign-in link inside the invitation.** It would expire long before many invitations are read.
- **Mail in the reader's language.** The sender does not know it: an invited address has no account and no language yet.

## Consequences

- `void/email` joins the Void modules only `*.server.ts` files may import, in `tests/unit/boundaries.test.ts`.
- `auth.ts` imports `cloudflare:workers` lazily, since `void db generate` reads it in Node, where there is no such module.
- The magic link plugin keeps its tokens in Better Auth's `verification` table; no table is added.
- The e2e round trip reads the dev server's inbox, with the token `vp dev` keeps in `.void/dev-trigger-token`. It checks that a grant is mailed, that an address with a grant gets a link and one with none does not, that the link signs in once and opens the talk shared with the address, that the answer is the same for both addresses, and that the new account has a name.
- Until the mail domain is set up and the account can send to anyone, a deployed dek.pub sends only to verified addresses, and a grant made in the meantime is not mailed again.
