# 80. Keep the GitHub login of a dek.pub account made with GitHub, and take it from GitHub's profile alone

Date: 2026-11-14

## Status

Accepted

Amends [77. Let a dek.pub person choose their handle after their first sign-in](0077-let-a-dek-pub-person-choose-their-handle-after-their-first-sign-in.md)

Amends [79. Open dek.pub by invitation, to the people it lists and those a deck is shared with](0079-open-dek-pub-by-invitation-to-the-people-it-lists-and-those-a-deck-is-shared-with.md)

## Context

ADR 77 has `mapProfileToUser` write the GitHub login to a user field, `githubLogin`, declared `input: false` so that no request could set it. Better Auth 1.7 does not store such a field. It passes what `mapProfileToUser` returns through `parseAdditionalUserInputFromProviderProfile` before `createUser`, and that drops every field declared `input: false`: Better Auth treats what a provider's profile maps to as input. So no account made with GitHub had a login. `suggestHandle` never offered it on `/welcome`, and `seedLinks` (ADR 78) never gave the profile its GitHub link. ADR 79 found this by reading the code; a test that runs `auth.ts` through Better Auth's GitHub callback reproduces it.

No other hook Better Auth calls on that path sees the login. `databaseHooks.user.create.before` and `create.after` are handed the user as Better Auth will store it. `account.create.after` is handed the account row, which holds GitHub's numeric ID, not the login. `user.validateUserInfo` is handed the raw profile, but it only lets an account be made or refuses it; it cannot change what is stored.

ADR 79 passed over declaring the field `input: true`, since Better Auth's sign-up and update endpoints would then take a login from the request.

## Decision

**`githubLogin` is declared `input: true`, and GitHub's profile is the only source dek.pub accepts for it.** `mapProfileToUser` stays as ADR 77 has it, and Better Auth now stores its value. Two checks close what `input: true` opens:

- **On sign-up, `validateUserInfo` refuses an account whose login is not its GitHub profile's.** The `Newcomer` schema in the person model's `type.ts` now reads the login of the account to be made too, and reads nothing when that login differs from the one in `source.oauth.profile` for the provider `github`, or when there is a login and no GitHub profile. As with any record it cannot read, `validateUserInfo` logs the reason and refuses with `not_invited`. So `/sign-up/email` with `githubLogin` in its body makes no account, and a GitHub sign-up whose login was lost on the way would be refused, not made without one.
- **On update, `databaseHooks.user.update.before` throws when the update sets `githubLogin`.** It answers 403 with the code `github_login_fixed`, and nothing is written. The hook does not check where the update comes from: dek.pub turns on neither of the options that make Better Auth rewrite a user from a provider's profile, `overrideUserInfoOnSignIn` and `accountLinking.updateUserInfoOnLink`.

**The login stays as it was when the account was made.** If GitHub renames the account, the stored login does not follow. Better Auth would rewrite the login on each sign-in only through `overrideUserInfoOnSignIn`, which also rewrites the name a person sets on `/settings` (ADR 78) and the address. Nothing reads the login after the first sign-in anyway: the handle is chosen on `/welcome` right after the account is made, and the links seeded from the login are then the person's own. An account made by a sign-in link and joined to GitHub later still has no login, as ADR 77 says.

**The test drives `auth.ts` through Better Auth.** `tests/unit/person.test.ts` builds Better Auth from `auth.ts` with a memory adapter and with dek.pub's stores mocked, since they need Void's D1. It answers GitHub's token, profile and address endpoints with a stubbed `fetch`, and follows `/sign-in/social` to `/callback/github`. It checks that the account stores the login and that `seedLinks` is handed it, that a second GitHub sign-in to it goes through, that `/sign-up/email` with a login is refused and one without it is not, and that `/update-user` with a login is refused and leaves the stored login unchanged.

**What was not chosen:**

- **Changing `data.user` inside `validateUserInfo`.** For `create-user`, Better Auth hands the hook the record it is about to store, so setting the login there would work. But a validator that writes is not part of Better Auth's contract, and a later version that hands the hook a copy would lose the login without any error.
- **Fetching the login from GitHub in `account.create.after`.** The hook has the access token, but each sign-up would wait on another request to GitHub, and it would still need a way to know that the request had come from GitHub's callback.
- **Dropping the login in `user.create.before` unless the endpoint is `/callback/:id`.** That keys the rule on Better Auth's route path, which no documented API promises. It also drops a forged login silently instead of refusing the request.
- **Faking GitHub in the e2e run.** Better Auth's GitHub provider hard-codes its endpoints, so the dev server would need a switch in `auth.ts` for tests alone.

## Consequences

- An account made with GitHub stores its login. `/welcome` suggests a handle from it, and the profile starts with its GitHub link, as ADR 77 and 78 intended.
- Better Auth now takes `githubLogin` from the body of a sign-up or an update-user, and dek.pub refuses either request.
- A Better Auth upgrade that stores mapped fields differently, or that stops handing the profile to `validateUserInfo`, fails the test or refuses GitHub sign-ups. It can no longer drop the login without anyone noticing.
- Turning on `overrideUserInfoOnSignIn` or `updateUserInfoOnLink` later would make GitHub sign-ins fail at the update hook, until the hook lets the profile's login through.
- Nothing is deployed, and the field's column is unchanged, so no migration is needed. An account made with GitHub in a local database before this change has no login, and keeps none.
