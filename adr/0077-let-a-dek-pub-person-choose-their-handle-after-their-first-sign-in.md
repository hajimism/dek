# 77. Let a dek.pub person choose their handle after their first sign-in

Date: 2026-11-14

## Status

Accepted

Amends [53. Send dek.pub's mail through Void and sign in by a mailed link](0053-send-dek-pub-s-mail-through-void-and-sign-in-by-a-mailed-link.md)

## Context

A handle names a person in every URL of theirs, `/@handle` and `/@handle/<slug>`, and in every thread and grant. dek.pub made it for them: the GitHub login, lowercased, for an account made with GitHub, and, as ADR 53 has it, the address's local part for one made by a sign-in link or the development email form. Nobody chose their own.

That went wrong in three ways:

- **Collisions failed sign-up.** The handle column is unique, so a second account whose login or local part came out the same as one already taken could not be made. A sign-in link then answered as if it had expired.
- **Anyone could be dek.pub.** A GitHub login or a local part such as `admin`, `support` or `dek` became a handle as it was, and a profile at `/@support` reads as the service's own.
- **The profile's GitHub link guessed.** It linked to `github.com/<handle>` whenever the account had a GitHub sign-in. An account made by a sign-in link and joined to GitHub later kept the handle its address gave it, so the link named someone else.

`type.ts` also put the account's ID in for a handle that was missing, so a page could show `/@<id>`, and nothing in the types said a handle might be absent.

## Decision

**A new account has no handle, and its holder chooses one, once, on `/welcome`.** Sign-up, by GitHub, by a sign-in link or by the development form, writes `handle` as null; `user.create.before` still gives an account with no name its address's local part. `handle` stays an additional field with `input: false`, so no API of Better Auth's, update-user included, may write it.

**Every page sends an account with no handle to choose one first, and back after.** `middleware/01.shared.ts` asks `handleGate` in the shell, which answers `/welcome?next=<path>` for a GET or HEAD whose `Accept` names `text/html`, or that Void's router sends for a page's data (`x-voidpages`), from any path but `/welcome`. A feed, a script, a stylesheet or a picture passes, so the welcome page loads and nothing but a page is redirected. `next` is read with `safeNext`, as on the sign-in page. The device flow goes through it too: `dekc pub login` → `/device?user_code=…` → sign-in → `/welcome?next=/device?user_code=…` → `/device`. Once a handle is chosen, `/welcome` itself redirects to `next`.

**The API refuses an account with no handle at one door, `currentPerson`.** It answers 409 with the code `handle_needed`, named `HANDLE_NEEDED` in `src/pub/protocol.ts`, and a hint naming `/welcome`. `requirePerson` goes through it, so publishing, making a CLI key, sharing, liking, muting and writing a comment of either kind are all refused; `dekc pub login` prints the hint if a code was approved by calling Better Auth directly. Reading is `currentAccount`'s: the GETs of comments and public comments, and the pictures, answer an account with or without a handle, as before.

**The types carry the state.** `Account` is the account as read, with `handle: string | null` and `githubLogin`. `Person` is `Account & { handle: string }`, and `hasHandle` tells one from the other. What reaches content takes a `Person`: `personByHandle`, `personById` and `peopleById` return only accounts with a handle, so deck owners, comment authors and the people on a profile, a card or a feed always have one. `Self`, the viewer every page is told of, has `handle: string | null`; the header shows the name and no profile link while it is null. The ID no longer stands in for a handle anywhere. A grant claimed by an account with no handle yet is listed by the address it was made for.

**The page suggests a handle and checks it as the person types.** `suggestHandle` offers the GitHub login, normalized, for an account made with GitHub, else the address's local part made a handle, whichever the rules allow; the loader offers it only when no one holds it. `GET /api/handles/<handle>` answers protocol `HandleStatus`, `free`, `taken`, `reserved` or `invalid`, to a signed-in account only. `PUT /api/me/handle`, with protocol `ChooseHandle`, answers `Me`, or `handle_invalid` or `handle_reserved` (422), or `handle_taken` or `handle_chosen` (409).

**Choosing writes once, and the unique index settles a race.** `setHandle` updates the user row whose ID matches and whose `handle` is null, through Better Auth's adapter. No row changed means the account had a handle already: `handle_chosen`. A write the unique index refuses, with the handle then held by another account, is `handle_taken`. A handle cannot be changed once chosen.

**Some handles are reserved for no one.** `src/model/person/handle.ts` keeps them beside the rules: dek's own names (`dek`, `dekc`, `dekpub`, `dek-pub`, `dekusercontent`), those of whoever runs a service (`admin`, `support`, `staff`, `official`, `security`, `abuse`, `postmaster` and the like), the names of pages (`about`, `settings`, `welcome`, `signin` and the like), and `someone`, which a page shows for an author whose account is gone.

**The GitHub login is kept as GitHub spells it.** `mapProfileToUser` writes it to a `githubLogin` field, `input: false`, which migration `20261114092049_wise_blue_shield` adds to the user table. A profile links to `github.com/<githubLogin>` when it is set, and to no GitHub page otherwise; `signsInWithGitHub` goes. Better Auth maps the profile only when it makes the account, so one made by a sign-in link and joined to GitHub later has no `githubLogin` and no link.

**What was not chosen:**

- **Keeping the derived handle and appending a number on a collision.** Sign-up would no longer fail, but `@sato-2` is nobody's choice, and a reserved word would still need refusing somewhere.
- **Asking for the handle on the sign-in page.** GitHub sign-in and a sign-in link both make the account before dek.pub sees the person again, so the handle cannot be asked for there, and a returning person would be asked for one they have.
- **Redirecting API calls, or a check in each route.** The CLI cannot follow a redirect to a page, and a check in each route would be missed in the next one. One door, with a code a client can read, covers both.
- **Letting Better Auth's update-user write the handle.** That needs `input: true`, which would let any account change its handle at any time, through a route dek.pub does not check.
- **Linking a profile to GitHub by the account's GitHub sign-in.** That needs the login, which the `account` row does not hold; it holds GitHub's numeric ID.

## Consequences

- A sign-up no longer fails on a handle someone holds, and a sign-in link no longer answers as if it had expired for that reason.
- Every new account takes one step more before it can publish or comment. A guest who only reads a talk shared with them chooses a handle too, since the talk page is a page.
- The compiler names each place that has to cope with a missing handle: the viewer in the header and on the pages behind the gate, the grant list, and what reads an account by its key.
- A handle cannot be changed, so a wrong one stays. Changing it later needs redirects from the old URLs, and a rule for when the old handle may be taken again.
- Nothing is deployed, so no account was made under the old rule but in a local database, which keeps the handles it gave.
- The e2e run checks that a new account is sent from `/device` to `/welcome` and back, that it gets no CLI key before choosing, that a reserved and a taken handle are refused, that a handle is chosen once, that a guest signed in by a link chooses one before the talk opens, and that a profile links to the GitHub login and not to the handle.
