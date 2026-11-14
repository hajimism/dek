# 79. Open dek.pub by invitation, to the people it lists and those a deck is shared with

Date: 2026-11-14

## Status

Accepted

Amends [43. Build dek.pub as a Void app and a serve Worker, checked on Miniflare](0043-build-dek-pub-as-a-void-app-and-a-serve-worker-checked-on-miniflare.md)

Amends [53. Send dek.pub's mail through Void and sign in by a mailed link](0053-send-dek-pub-s-mail-through-void-and-sign-in-by-a-mailed-link.md)

Amended by [80. Keep the GitHub login of a dek.pub account made with GitHub, and take it from GitHub's profile alone](0080-keep-the-github-login-of-a-dek-pub-account-made-with-github-and-take-it-from-github-s-profile-alone.md)

Amended by [82. Let a dek.pub talk be deleted for good by its owner, and taken down by an operator](0082-let-a-dek-pub-talk-be-deleted-for-good-by-its-owner-and-taken-down-by-an-operator.md)

## Context

dek.pub opens first by invitation. What it lacks before anyone may sign up, rate limits, quotas, a way to report a talk, deleting one's own account, is not built, so the first people in have to be people its operator chose.

Until now anyone could make an account. ADR 53 mails a sign-in link only to an address that has an account or a grant waiting for it, so a stranger could not make one by mail, but it left GitHub open: "GitHub stays the way to sign up for everyone else."

The people a deck is shared with by address have to get in all the same. A reviewer at a client is invited by the deck's owner, not by dek.pub, and signs in by a link (ADR 53), which claims their grant (ADR 73).

Better Auth 1.7 makes an account in three places dek.pub uses: the GitHub callback, the sign-in link's verify, and the development email form. All three call `createUser`, which first asks the application's `user.validateUserInfo` with `action: "create-user"`. For GitHub that call carries the raw profile, login and all; a refusal there becomes an `APIError` with the code the application chose, which the GitHub callback and the link's verify send to the browser as `?error=<code>` on their error URL.

`databaseHooks.user.create.before` runs later in the same call, but the GitHub login does not reach it: Better Auth reads the fields `mapProfileToUser` adds through `parseAdditionalUserInputFromProviderProfile`, which drops every field declared `input: false`, as `githubLogin` is (ADR 77). By the same reading of the code, `githubLogin` is never stored for an account made with GitHub; this was found reading Better Auth's source, not reproduced, and is not changed here.

## Decision

**`DEK_PUB_INVITED` says who may make an account.** It is a setting in `env.ts`, a secret in production, empty by default. It holds entries split by commas or whitespace, each an email address, or `@<GitHub login>` for a GitHub account whatever its address. The entry `*`, as the whole list, lets anyone in; `*` beside other entries counts for nothing, as does any entry that is neither an address nor a login. Entries are trimmed and compared in lowercase. `dev.env` sets `*`, so local runs keep working. Production must never hold `*` until the work listed under "Before anyone can sign up" in apps/pub's list of what is missing is done.

**An account may be made when** the list is `*`; or the address it is made for is verified and on the list; or it is made with GitHub and its login is on the list as `@login`; or its address is verified and `DEK_PUB_OPERATORS` lists it (ADR 82), so an operator needs no invitation; or its address is verified and a grant waits for it, which is how a reviewer a deck is shared with gets in. An address that is not verified never counts: the development email form, which verifies none, makes an account only under `*`. The rule is `mayJoin` in `src/model/person/invited.ts`, with `readInvited` for the setting and `readOperators` for the operators; it takes the lookup of a waiting grant as a function, since the person model does not know the deck model. The sign-in feature's `mayMakeAccount` joins them to both settings and to `hasWaitingGrant`.

**It is enforced in `user.validateUserInfo` in `auth.ts`.** For `action: "create-user"` it reads what Better Auth hands it through the `Newcomer` schema in the person model's `type.ts`, the address, whether it is verified, and the login of a GitHub profile, and returns the error `not_invited` unless `mayMakeAccount` agrees. A record it cannot read is refused and logged. Any other action, a GitHub sign-in to an account that exists or GitHub joined to an account by the same verified address, returns at once: signing in to an existing account is never refused, and makes no account to refuse.

**A sign-in link goes to an address that has an account or may make one.** `sendSignInLink` asks `mayMakeAccount` of the address as verified, since following the link verifies it. So an address on the list, and any address under `*`, is mailed a link too. Better Auth answers the request the same whether or not anything is mailed, and the lookup still runs after the answer, so the answer tells no one who is invited.

**The sign-in page says why it failed.** It now passes `errorCallbackURL` for GitHub too, the sign-in page with the same `next`, so a refusal comes back there instead of to Better Auth's own error page. `signInFailure` reads `?error=`: `not_invited` says that dek.pub is open by invitation for now and that someone a talk was shared with should sign in with that address; `INVALID_TOKEN`, the code for a link that has expired or was used, keeps its message; any other code says that signing in did not work. The code itself is never shown, since anyone can write the URL. The About page's "Getting started" says dek.pub is open by invitation for now.

**What was not chosen:**

- **`databaseHooks.user.create.before`.** Every sign-up passes it, but on the GitHub path it is handed the user without `githubLogin`, so `@login` entries could never match.
- **Declaring `githubLogin` with `input: true`** so that it reaches that hook. Better Auth's sign-up and update endpoints would then take it from the request, and anyone could name a login they do not hold.
- **A domain wildcard, such as `*@example.com`.** An invitation names a person; a domain is for a later, wider opening.
- **A table of invitations.** Nobody but the operator invites yet, and a setting needs no page to manage it.

## Consequences

- Production needs `DEK_PUB_INVITED` set with `void secret put`, beside the settings ADR 43 lists; unset, only the people decks are shared with can sign up.
- A `.env` written before this has no `DEK_PUB_INVITED`, which lets only grantees sign up locally; `apps/pub/AGENTS.md` says to add `*`.
- Taking a person off the list, or a grant back, stops them making an account, not signing in to one they made.
- The e2e server sets the list to the exact addresses the run signs up, and the run signs up by mailed links instead of the email form. It checks that an invited address signs up with nothing shared, that a guest signs up by the share waiting on their address, that a link followed after its share was taken back makes no account and sends the browser to `/signin?error=not_invited` with the message, that the email form makes no account for an unverified address on the list, and that the guest, on no list and with nothing waiting, signs in again. GitHub cannot be reached from the run, so `@login` entries are checked by unit tests of `readInvited`, `readNewcomer` and `mayJoin`.
- If a later Better Auth stops passing the GitHub profile to `validateUserInfo`, `@login` entries stop matching and those people are refused, never let in.
