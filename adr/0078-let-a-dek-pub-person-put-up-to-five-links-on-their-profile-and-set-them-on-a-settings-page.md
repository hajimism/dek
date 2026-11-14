# 78. Let a dek.pub person put up to five links on their profile and set them on a settings page

Date: 2026-11-14

## Status

Accepted

Amends [77. Let a dek.pub person choose their handle after their first sign-in](0077-let-a-dek-pub-person-choose-their-handle-after-their-first-sign-in.md)

Amended by [83. Let a dek.pub person list and revoke their CLI keys, and revoke them all with dekc pub logout --all](0083-let-a-dek-pub-person-list-and-revoke-their-cli-keys-and-revoke-them-all-with-dekc-pub-logout-all.md)

## Context

A profile showed one link, to `github.com/<githubLogin>`, and only for an account made with GitHub (ADR 77). Nobody could link to their X account, their site, or the services Japanese speakers publish talks and articles on: Zenn, Qiita, note, Speaker Deck, connpass. An account made by a sign-in link and joined to GitHub later had no link at all.

Nor could anyone change anything about themselves. dek.pub had no settings page: the name Better Auth took at sign-up, a GitHub profile's or the address's local part, was the name for good. Two later tasks need such a page too: revoking every CLI key, and deleting an account.

## Decision

**A person keeps an ordered list of up to five links, in dek.pub's own table.** `profile_links` holds one row a link, `(user_id, position)` its key and `url` the link, beside the other tables keyed by an account's ID with no foreign key into Better Auth's. Migration `20261114095212_silly_king_bedlam` makes it. Setting the list replaces it whole: `setLinks` deletes the account's rows and inserts the new ones in one D1 batch, so a reader never sees half a list.

**A link is an https address of a named host, as the URL parser writes it.** `readLink` in `src/model/person/link.ts` trims what was typed, takes it as https when it names no scheme (`zenn.dev/name`), and refuses: what does not parse, or names a host without a dot (`invalid`); any scheme but https, `http:` and `javascript:` among them (`not_https`); a user name or a password in it (`credentials`); and more than 500 characters as written out (`too_long`). `readLinks` refuses the same link twice (`duplicate`) and a sixth (`too_many`), and says which link it refused. The settings page checks by these functions as the person types, and the API saves by them.

**The profile names each link by its service or its site.** `linkFace` knows GitHub, X (`x.com` and `twitter.com`), Bluesky (`bsky.app`), YouTube, LinkedIn, Zenn, Qiita, note, Speaker Deck and connpass by their hosts, and reads the account from a profile's path as the service writes it: GitHub `hajimism`, X `@hajimism`, Zenn and Qiita `@name`, Bluesky `@handle`. A page of the service that is no profile, `github.com/owner/repo`, shows the service's name alone. Any other host is a personal site, shown by its host without `www.`. Mastodon is not recognized: any server may run it, and nothing in its address says so. Only GitHub has an icon of its own; the others show the link icon and a site the globe, so no icon set is added for them. Each link is an anchor with `rel="me nofollow ugc noopener"`, its text set as text.

**An account made with GitHub starts with its GitHub profile.** `user.create.after` in `auth.ts` calls `seedLinks`, which writes `firstLinks`: `https://github.com/<githubLogin>` for an account that has a login, nothing for any other. Better Auth runs the hook once the account is written and fails the sign-up with whatever it throws, and the next try would be a sign-in, so a seed that fails is logged and the sign-up goes on without the link. From then on the link is the person's like any other, to keep, move or remove. The profile loader reads the table alone, and `ProfilePage.github` goes, with the template's GitHub link; this replaces ADR 77's paragraph on the profile's GitHub link. `githubLogin` stays for `suggestHandle`.

**A settings page at `/settings` holds what a person sets of themself.** Signed out, it sends them to `/signin?next=/settings`; with no handle yet, to `/welcome?next=/settings`, as every page does. It has a section for the profile, the handle shown as it stays (ADR 77) and the name, and one for the links, each saved on its own. The links are edited as a list: a field each, buttons to move one up or down or to remove it, one to add another up to five, and under each field how the profile will name it or what is wrong with it. An empty field is no link and goes with the save. The page is one column on the header's left edge, each block the column's width, its Japanese hints set justified. The header's account menu links to it.

**The API is `GET`/`PUT /api/me/links` and `PATCH /api/me`.** `/api/me/links` answers protocol `ProfileLinks`, `{ links }`, and takes the same shape to replace them, answering the list as saved. A refused list is a 422 with `link_invalid`, `link_not_https`, `link_credentials`, `link_too_long`, `link_duplicate` or `links_too_many`; `LINK_CODES` in the feature's `type.ts` maps each problem to its code, and the page maps a code back. `PATCH /api/me` takes protocol `UpdateMe`, `{ name }`, and answers `Me`. `readName` in `src/model/person/name.ts` drops control characters, makes each run of spaces one, trims, and refuses an empty name (`name_empty`) or one over 50 characters (`name_too_long`). `setName` writes it through Better Auth's adapter, as `setHandle` writes a handle. Both routes go through `requirePerson`, so a person writes them by an API key as well as from the page, as they do every other route.

**Better Auth answers over HTTP only what dek.pub's pages, `dekc pub` and the dev login call.** Its routes sit beside dek.pub's under `/api/auth/` and pass none of dek.pub's checks: `update-user` would take any name, an empty one or 5,000 characters, and any `image` URL, which pages would draw as an `<img>`. `disabledPaths` in `auth.ts` closes every endpoint but signing in and out (`sign-in/social`, `callback/:id`, `sign-in/magic-link`, `magic-link/verify`, `sign-out`, `get-session`), the device flow (`device`, `device/code`, `device/token`, `device/approve`, `device/deny`), the dev login (`sign-up/email`, `sign-in/email`, which `emailAndPassword` turns off on the deployed app) and Better Auth's error page (`error`), and each closed one answers 404. Closed are: what changes an account (`update-user`, `update-session`, `change-email`, `change-password`, the password reset and the address check, `delete-user` and its callback, `link-social`, `unlink-account`), since its name goes through `PATCH /api/me`, nothing changes its address, password or joined accounts, and deleting one must delete dek.pub's rows too; what hands out or reads the GitHub token (`list-accounts`, `get-access-token`, `refresh-token`, `account-info`), which dek.pub uses only at sign-in; the sessions' list and revocation; the API key plugin's `api-key/*`, since dek.pub makes a key for `dekc pub login` and checks it on the server; and `ok`. `set-password` has no path. The closed paths close HTTP only: the server still calls the API key plugin through `auth.api`. A unit test builds Better Auth from `auth.ts` and lists every open endpoint, so one a Better Auth upgrade adds fails it until it is closed or named.

**What was not chosen:**

- **Fixed fields, one a service, as GitHub's and Zenn's settings have them.** They fix which services a person may name, and in what order. A list with a recognizer takes any site and puts it where its owner wants.
- **The list as a JSON column on a profile row.** One write instead of a batch, but a JSON column is read through a schema at every read, and a row a link needs no such reading.
- **Showing GitHub's link from `githubLogin` until the person saves a list, with no row written at sign-up.** It would need no hook, but the profile would keep a special case for GitHub, and a list saved empty would have to be told from no list saved.
- **Brand icons for every service.** Each is a trademark with rules on how it is drawn, and an icon set big enough for ten would weigh more than the page's other icons together. The name says which service a link is.
- **Better Auth's own `update-user` for the name.** It takes a name as it comes, and it is a second door beside dek.pub's API. `PATCH /api/me` reads it by dek.pub's rules first.
- **Closing `update-user` alone.** The other endpoints that change an account, hand out its GitHub token or make API keys are as far from dek.pub's rules, and none is used.
- **A plugin whose `onRequest` lets only the named paths through.** It would close what an upgrade adds without a change here, but it would match the callback's and the device flow's paths itself, where `disabledPaths` is Better Auth's own option; the test catches an added endpoint instead.

## Consequences

- A person can link their profile to wherever they publish, in the order they choose, and dek.pub vouches for none of it (`nofollow ugc`).
- Every profile reads one more query, the account's links, beside its talks.
- An account made with GitHub writes a row at sign-up. One made before this change, in a local database, has no rows and shows no links until its person saves some; nothing is deployed.
- If that row cannot be written, the account is made with no link and a line in the log, and its person adds the link on `/settings`.
- `/api/auth/` answers 404 for every Better Auth endpoint dek.pub does not call. A later page that needs one, such as revoking sessions, opens it here and in the test.
- The e2e run cannot sign up with GitHub, so that an account made with it starts with its link is checked by the unit tests of `firstLinks`, not end to end. The e2e run checks the settings page's redirect, each refusal's code, the list saved and shown in its order with its `rel`, removing every link, and a name changed and an empty one refused.
- The settings page is where revoking every CLI key and deleting an account go, each a section of its own.
- A name shows on the next page after it is saved; the header reads it from the session's account.
