# 85. Let dek.pub's operators invite people to sign up from the settings page, and keep who is invited in D1

Date: 2026-11-14

## Status

Accepted

Amends [79. Open dek.pub by invitation, to the people it lists and those a deck is shared with](0079-open-dek-pub-by-invitation-to-the-people-it-lists-and-those-a-deck-is-shared-with.md)

## Context

ADR 79 kept who may sign up in a setting, `DEK_PUB_INVITED`, a secret in production. Inviting one more person meant `void secret put`, which deploys a new version of the Worker, by whoever holds the Cloudflare token. It passed over a table: "Nobody but the operator invites yet, and a setting needs no page to manage it."

The operators now have a name and a check of their own: `DEK_PUB_OPERATORS` lists them by verified address, and such an address may always make an account (ADR 82). ADR 82 chose the address over a user ID so that the first operator of an empty database could sign up from the settings alone, for this change. Settings routes that an API key must not reach go through `requireSessionPerson` (ADR 83). The table `invitations` already exists, and counts the invitation mail a grant sends (ADR 84); it is not a list of who may sign up.

`DEK_PUB_INVITED` also held `*`, which let anyone in; `dev.env` set it, so a local run could sign up by the email form, which verifies no address. A switch like that must not reach production by mistake.

ADR 79 left an orphan open: `hasWaitingGrant` asked `grants` alone, so a grant row left behind by a deck deleted at the same moment (ADR 82) still let its address make an account.

## Decision

**Who may sign up is kept in D1, in `sign_up_invites`, and an operator manages it on `/settings`.** Each row is one entry: an email address, or `@` and a GitHub login, trimmed and in lowercase and unique (`sign_up_invites_entry`); `added_by`, the operator's account; `created_at`; and `claimed_by` and `claimed_at`, the account made from it and when, null until then. The table holds no deck, so it is not in `DECK_ROWS` (ADR 82). It is named apart from `invitations`, which stays the count of a grant's mail (ADR 84).

- **An entry is read by `readInviteEntry`** in `src/model/person/sign-up-invite.ts`: an address with no quoting, comments or brackets, on a domain of two labels or more, up to 254 characters; or `@` and a login GitHub would give, letters, digits and single hyphens, up to 39. Nothing else is an entry: no `*`, no domain wildcard, no handle alone. `readInviteEntries` reads a list of up to 50 as all or none, each entry once, and names the first it cannot read as typed. The page checks with the same functions before it sends anything.
- **`DEK_PUB_INVITED` goes**, with `readInvited` and the `Invited` type. Nothing reads it any more; a value left in a `.env` or a secret does nothing.

**An account may be made when** sign-up is open, which only a local run has (below); or its address is verified and `DEK_PUB_OPERATORS` lists it, as before, so the first operator signs up on an empty table; or an entry no account has claimed names its verified address or its GitHub login; or its address is verified and a grant on a deck that is there waits for it. `mayJoin` in `src/model/person/invited.ts` now takes the newcomer and a `JoinRule`, `{ open, operators, invited, grantWaits }`, whose two lookups the sign-in feature's `mayMakeAccount` hands it: `hasOpenSignUpInvite` and `hasWaitingGrant`. `inviteEntriesOf` says which entries name an account, its address once verified and `@` its login, so an unverified address never counts, as in ADR 79. The check stays where ADR 79 put it, `user.validateUserInfo`, and the `@login` match stays held to the GitHub profile's login by the `Newcomer` schema (ADR 80).

**An entry lets one account in.** `user.create.after` in `auth.ts`, beside `seedLinks`, calls `claimInvitesOnSignUp`, which marks every unclaimed entry naming the new account, by `inviteEntriesOf`, as claimed by it. A claimed entry lets no one else in: if the account is deleted by hand, its address cannot make another from the same entry. A claim that fails is logged and does not fail the sign-up, as a link that cannot be seeded does not; the entry then stays unclaimed and lets in only what it names, which now has an account. An entry for someone who already had an account when it was added is never claimed, and its operator may remove it.

**Only an operator signed in through the browser may see or change the list, and everyone else gets a 404.** The routes are `GET /api/invites` and `POST /api/invites`, and `DELETE /api/invites/:id`, `paths.invites` and `paths.invite` in the protocol. One function in the settings feature's `invites.server.ts`, `sessionOperator`, decides for all three, and the loader asks the same test: an account read from the session, with a handle, whose verified address `DEK_PUB_OPERATORS` lists (`isOperator`). It does not go through `requireSessionPerson`, whose 401, 403 `session_needed` and 409 `handle_needed` would tell a caller that something is there: anyone signed out, any API key, an operator's own among them, and any person who is not an operator gets the API's `not_found`, as for a deck they may not see. The body of a `POST` is read only after that test, so how a bad body is refused says nothing either.

- **`GET`** answers protocol `SignUpInvites`, `{ invites }`, the newest first. Each `SignUpInvite` is `{ id, entry, addedAt, addedBy, claimedAt, claimedBy }`, the two people by handle, null for an account with no handle or none any more.
- **`POST`** takes protocol `NewSignUpInvites`, `{ entries }`. An entry it cannot read refuses the whole list with a 422, `invite_invalid`, and an empty list or one of more than 50 has its own code, `invites_empty` and `invites_too_many`. An entry there already, claimed or not, is left as it was and is not mailed again. It answers the list as it stands after.
- **`DELETE`** removes an entry no account was made from, and answers the list as it stands after. A claimed entry stays, as the record of who came in by it: 409 `invite_claimed`. An ID with no entry is a 404 `invite_not_found`, which only an operator can reach.
- `PROTOCOL_VERSION` stays 2. These are new routes that no dekc calls.

**Adding an address mails it an invitation to sign up, and adding a login mails nothing.** `inviteMail` in the settings feature says the same whoever sent it: that the reader is invited to make an account on dek.pub, to open the sign-in page, `appUrl("/signin")`, and sign in there with the address it went to, and to ignore the mail if they did not expect it. It names no operator and carries nothing an operator typed but the address. The reader has no account, so no language on dek.pub, and the mail is written in English, then in Japanese; every other mail is in English for now. It goes after the answer (`afterAnswer`), through `sendMail`, and a mail that is not sent is logged, as every mail is. An operator's mail is not counted in `invitations` and has no limit: only an operator sends it, and they are the people who run dek.pub.

**The settings page has an Invitations section for an operator alone**, below the CLI keys. Its loader reads the list only when `invitesFor` finds an operator, and hands every other person `invites: null`, for which the page renders no section. A field takes one entry or several, split by commas or whitespace, and an Invite button; each entry is a row with when it was added and by whom, and either Not signed up yet with a Remove button, which removes it at once, or the handle that signed up by it and when, with nothing to remove.

**Sign-up open to anyone is a development switch, `DEK_PUB_OPEN_SIGN_UP`, that counts only beside `DEK_PUB_DEV_LOGIN`.** `signUpIsOpen` lets anyone in only when both are `1`. `dev.env` sets both, so `bun run dev` still signs anyone up by the email form. It defaults to `0`, and production must keep it unset: it already must keep `DEK_PUB_DEV_LOGIN` unset, so the switch alone, set by mistake, opens nothing. The e2e server sets it to `0` and `DEK_PUB_DEV_LOGIN` to `1`, and the run starts from an empty database: its operator signs up by `DEK_PUB_OPERATORS` alone and invites, from `/api/invites`, the addresses the run signs up.

**`hasWaitingGrant` joins `decks`.** Only a grant on a deck that is there lets its address make an account, or be mailed a sign-in link. The item in apps/pub's list of what is missing goes.

**Invitation grows as a tree through grants, and the operators' list bounds where it starts, not how far.** A person a deck is shared with by address may sign up (ADR 79), and once in may share with 20 new addresses a day (ADR 84), each of which may sign up in turn. The list decides who comes in without a share, not who joins. That stays so until the work listed under "Before anyone can sign up" in apps/pub's list of what is missing is done.

**What was not chosen:**

- **Keeping `DEK_PUB_INVITED` beside the table**, as a list the table adds to. Two places to look for who may sign up, one of them only redeployed, is one too many; the operators' own addresses are the one thing the table cannot hold, since the first operator has no account to add it with.
- **Seeding the e2e run's list through `DEK_PUB_OPEN_SIGN_UP` or SQL.** Open sign-up would let the run's refusals pass, and SQL would leave the page's own routes unchecked. The run invites through the routes, as an operator would.
- **Claiming on every sign-in, as grants by address are (ADR 73).** It would also mark an entry for an account that existed before it, but then an entry would mean "this account was here", not "this entry let it in", and one query more would run on every sign-in.
- **Refusing an entry whose address or login already has an account.** It would tell an operator nothing they need, and a login would need a lookup Better Auth has no index for.
- **Answering a non-operator with `requireSessionPerson`'s errors.** They would tell an API key or a stranger that the route is there.
- **A limit on an operator's invitations**, as ADR 84 has for grants. Only the people who run dek.pub send them.
- **Sending the invitation in one language, by the operator's.** The reader, not the operator, reads it, and dek.pub knows nothing of the reader yet.

## Consequences

- An operator invites someone by adding them on `/settings`, without a deploy. Production needs `DEK_PUB_OPERATORS` set, as before, and no `DEK_PUB_INVITED`. A `DEK_PUB_INVITED` secret set before this does nothing, and can be deleted.
- A `.env` written before this has `DEK_PUB_INVITED=*` and no `DEK_PUB_OPEN_SIGN_UP`, which lets only the operators and the people decks are shared with sign up locally; `apps/pub/AGENTS.md` says to add `DEK_PUB_OPEN_SIGN_UP=1`.
- Removing an entry, or taking a grant back, stops an account being made, not signing in to one made already. A sign-in link mailed before the entry was removed makes no account, and sends the browser to `/signin?error=not_invited`, as a share taken back does.
- An entry is single-use. Letting the same address in again after its account is deleted takes removing the claimed row by hand, as deleting the account is.
- Deleting an account, still done by hand, leaves the entries it added and the one it claimed; the list of what is missing says so.
- The e2e run checks that the operator signs up on an empty database and sees the section; that an entry it cannot read adds none of a list; that each address added is mailed the sign-in page in fixed words, that a login is mailed nothing, and that an address added again is not mailed again; that the entries are claimed by the accounts made from them, with or without a handle, and that a claimed one cannot be removed; that someone who is not an operator, signed in or out, and the operator's own API key, get a 404 from every route, and that the page shows them no section; that an address whose entry is removed after it was mailed a sign-in link makes no account; and that a share whose deck is gone lets its address make none. GitHub cannot be reached from the run, so a `@login` entry letting a GitHub account in is checked by unit tests of `mayJoin` and `inviteEntriesOf`, and its claim by the test that drives `auth.ts` through Better Auth's GitHub callback.
