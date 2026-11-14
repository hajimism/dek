# 83. Let a dek.pub person list and revoke their CLI keys, and revoke them all with dekc pub logout --all

Date: 2026-11-14

## Status

Accepted

Amends [47. Put a talk on dek.pub with the dekc pub commands](0047-put-a-talk-on-dek-pub-with-the-dekc-pub-commands.md)

Amends [48. Keep the dek.pub key in the OS keychain, and send it only to its server](0048-keep-the-dek-pub-key-in-the-os-keychain-and-send-it-only-to-its-server.md)

Amends [78. Let a dek.pub person put up to five links on their profile and set them on a settings page](0078-let-a-dek-pub-person-put-up-to-five-links-on-their-profile-and-set-them-on-a-settings-page.md)

## Context

Each `dekc pub login` trades the device flow's session for an API key of Better Auth's api-key plugin, which lasts a year (ADR 47). `DELETE /api/cli/key` revokes the key the call carries and no other, and `dekc pub logout` calls it. A person in CI sets `DEK_TOKEN` to such a key (ADR 48). Nothing listed a person's keys, and nothing revoked any key but the caller's own. A key that leaked from CI therefore worked for up to a year, and its owner could neither see it nor stop it.

Every key was named `dekc (<User-Agent>)`. The CLI sends `dekc/<version>` as its User-Agent, so every key had the same name, and a list of them would not say which machine held which.

Better Auth's plugin has routes to list keys and to delete one (`/api-key/list`, `/api-key/delete`). Both sit behind its session middleware, so a call that carries only an API key cannot use them. dek.pub already deleted a key through Better Auth's adapter (`revokeKey`). The plugin records when each key was last used: with its rate limit off, as `auth.ts` has it, every check writes `lastRequest`.

Every dek.pub route took a person through `requirePerson`, which accepts a browser's session or an API key alike. ADR 78 said so of the settings routes, `PATCH /api/me` and `GET`/`PUT /api/me/links`, too. The CLI calls none of them; `dekc pub whoami` calls `GET /api/me` alone.

ADR 78 named the settings page as the place for revoking every CLI key.

## Decision

**A person's keys are listed and revoked through Better Auth's adapter, by the account they belong to.** `src/model/person/api-key.server.ts` gains `keysOf`, `revokeKeyOf` and `revokeKeysOf`, beside `makeKey` and `checkKey`. Each reads or deletes `apikey` rows `where referenceId = <account>`, the field the plugin keys an owner by. `KeyRow` in the person model's `type.ts` reads a row through zod. The plugin's own routes are not used, since they take a session alone. `revokeKey` goes: revoking the caller's key at `DELETE /api/cli/key` now goes through `revokeKeyOf` too, by the account its check found.

- **A key is shown by its ID, its name, when it was made, when it was last used, and when it runs out**, as protocol `CliKeyInfo`, `{ id, name, createdAt, lastUsedAt, expiresAt }`. Never the key, its hash, or its first characters (`start`). `lastUsedAt` is the plugin's `lastRequest`.
- **The list leaves out a key past its expiry**, which no longer works, and puts the newest first.
- **Revoking them all deletes every row of the account's**, those past their expiry too. It answers how many of them still worked. It deletes the rows it read by their IDs, so a key made while it runs stays.

**A key is named after the machine that asked for it.** `dekc pub login` sends protocol `NewCliKey`, `{ name }`, as the body of `POST /api/cli/key`. The name is the first label of the host name (`hostLabel` in `src/core/pub/login.ts`): `hajime-mbp` of `hajime-mbp.local`, `runner-7` of `runner-7.corp.example.com`. Nothing past the first dot is sent, since a domain can name the network a machine is on. The host name goes only to the server the key is for, and only its owner sees it. `keyName` in `src/model/person/api-key.ts` drops control and format characters, makes each run of spaces one, and cuts the name to 64 characters. A call with no JSON body, from an older dekc or a script, gets a key called `dekc`; a key made in the browser for CI is one of those.

**The routes, under `/api/me/keys`:**

- `GET /api/me/keys` answers protocol `CliKeys`, `{ keys }`.
- `DELETE /api/me/keys` revokes every key of the person's and answers protocol `KeysRevoked`, `{ revoked }`, the count.
- `DELETE /api/me/keys/:id` revokes one and answers `{ revoked: 1 }`. A key that is not the caller's, or is gone, is a 404 `key_not_found`, the same for both, as a deck someone may not see is.
- `DELETE /api/cli/key` stays as it was: the key the call carries, and that one alone.

**Who may do what, by what the call carries:**

| | A browser's session | An API key |
| --- | --- | --- |
| List the keys | yes | no |
| Revoke one key | yes | only itself, at `DELETE /api/cli/key` |
| Revoke every key | yes | yes |
| Change the name or the links | yes | no |
| Read who it is (`GET /api/me`), publish, comment, share | yes | yes |

- **Revoking every key is the one thing a key may do to the others.** It is what a leak calls for: `dekc pub logout --all` from any machine still signed in stops every key, the leaked one among them, without a browser at hand. A leaked key can do the same, and stop its owner's other keys, but no more than that. Its owner signs in again, and the leaked key is gone with the rest.
- **A key may not list the keys.** The list names its owner's machines, which a leaked key should not learn.
- **A key may not revoke another key alone.** A leaked key that could would revoke its owner's keys one by one and keep itself.
- **A key may not change the settings.** The CLI never calls these routes, and a leaked key should not change who its owner is on dek.pub. This amends ADR 78, which let a key write them.

**One function says so: `requireSessionPerson`** in `src/model/person/actor.server.ts`, beside `requirePerson`. A call with no session that carries an API key is a 403, protocol `SESSION_NEEDED` (`session_needed`), whose hint opens `/settings` in a browser. A call with neither is the 401 `requirePerson` gives. `myLinks`, `saveLinks` and `saveName` in the settings feature now go through it, and so do `myKeys` and `revokeMyKey` in its new `keys.server.ts`; `revokeMyKeys` goes through `requirePerson`.

**The settings page has a CLI keys section**, below the links. Its loader reads the keys with the links. Each key is a row: its name, when it was made, when it was last used, or Never used, and when it expires; and a Revoke button, which revokes it at once and takes it off the list. A key revoked by mistake costs one `dekc pub login`. Revoke all opens a dialog, with Cancel focused, that says every dekc and every `DEK_TOKEN` stops working and this browser stays signed in. Revoking keys signs no session out. A revoke that fails leaves the list as it was and says why. With no keys, the section says that `dekc pub login` makes one.

**`dekc pub logout --all` revokes every key of the account**, then forgets the one kept here.

- **It sends the key there is here: `DEK_TOKEN` when it is set for the server, else the one `login` kept**, as every other command that acts for the account does. Plain `logout` still revokes only the key `login` kept and leaves `DEK_TOKEN` alone (ADR 48). With `--all` the `DEK_TOKEN` key is among those revoked whichever is sent, so sending it takes nothing more from its owner, and a CI job that leaked its key can stop every key itself.
- **It fails when the server does not revoke them, and keeps the key.** A plain `logout` forgets the key even when the server cannot be reached, since a key forgotten here is a key no one here can use. `--all` exists to stop keys elsewhere. If it forgot the key it holds and the server never got the call, it could not be run again. A command that fails changes nothing.
- **With no key, it is an error** whose hint is to run `dekc pub login`, then `dekc pub logout --all`, or to revoke the keys on the server's `/settings`.
- **`--json` keeps the shape of `logout` and adds `revokedKeys`**: `{ action: "logout", server, revoked: true, forgotten, revokedKeys }`, the count the server revoked, the key sent included. A new form of `logout` would read as none of the old ones, which ADR 31 counts as breaking; a new property does not. Text says `revoked <n> keys of the account on <server>, this one included`, then whether a key was forgotten.
- `--all` is a new flag, taken by `logout` alone.

**`PROTOCOL_VERSION` stays 2.** The new routes, the new answers and the optional body of `POST /api/cli/key` change nothing an older dekc sends or reads.

**What was not chosen:**

- **Better Auth's `/api-key/list` and `/api-key/delete`, called with the request's headers.** They take a session alone, so revoking every key with a key would need the adapter anyway. Two paths to the same rows would be one too many.
- **Disabling a key instead of deleting it** (the plugin's `enabled`). A key revoked has no use to come back to, and a disabled row would stay in the list to be left out.
- **The full host name, or the User-Agent, as the name.** A domain can name a network, and the User-Agent is the same for every machine. Asking the person for a name would make `login` ask a question, and no dek command prompts (ADR 48).
- **Letting a key list the keys, so that `dekc pub` could show them.** It would hand a leaked key its owner's machines. The list is the browser's.
- **Revoking every key also signing out every session.** A browser session is not a CLI key, and the person revoking them is using one.
- **Making `--all` forget the key when the server fails, as plain `logout` does.** See above: it could not be run again.

## Consequences

- A key that leaks from CI stops with one `dekc pub logout --all` from any machine still signed in, or with Revoke all on `/settings`. Every other dekc of the account has to sign in again, and CI needs a new key.
- A person sees which machines hold a key and when each last used it, and revokes the one they no longer use.
- A key made before this change keeps its name, `dekc (dekc/<version>)`, until it is revoked or expires; one an older dekc makes from now on is called `dekc`.
- An API key can no longer change a person's name or links. A script that did so has to use the browser.
- The plugin writes `lastRequest` on every call with a key, as it did before; the list now shows it.
- `dekc pub logout --all` and `revokedKeys` are new. Their docs, `llms.txt`, the `--json` schema and the command's usage name them.
- Deleting an account is still done by hand on request, and has to revoke the account's keys with `revokeKeysOf`.
