# 48. Keep the dek.pub key in the OS keychain, and send it only to its server

Date: 2026-11-12

## Status

Accepted

## Context

`dekc pub` (ADR 47) is the second command that reaches the network, after `dekc ref`, and the first that holds a credential of its own: the API key dek.pub gives for a sign-in. That key can publish and change the user's decks, so where it is kept and where it is sent matter as much as for the GitHub token of ADR 12.

- **Where to keep it.** A file in the user's config folder is what most CLIs do, and it is read by anything that runs as the user. macOS, Windows, and most Linux desktops have a keychain, and Bun 1.4 reaches it through `Bun.secrets`. A server, a container, or CI may have none.
- **CI signs in with no browser.** It needs a key it is handed.
- **More than one server.** dek.pub runs on the developer's machine while it is built, and could run elsewhere. A key for one must not reach another.
- **The tests must never touch the real keychain or the developer's home**, nor reach dek.pub.
- **The device flow waits across runs** (ADR 47), so its code, short-lived but a credential while it lives, must be kept somewhere too.
- **CONTRIBUTING's raw APIs.** A fetch in `src/` has a deadline and an error that says what did not answer; a file write goes through `safe-fs`.

## Decision

**The key is kept per server origin**, in the OS keychain through `Bun.secrets`, under the service `dek.pub` and the server's origin as the name. Where the keychain cannot be reached, as on a Linux with no secret service, it goes to `$XDG_CONFIG_HOME/dek/credentials.json` (`~/.config/dek/` by default), `{ "version": 1, "keys": { "<origin>": "<key>" } }`, written through `safe-fs` with mode 0600 in a folder made with mode 0700. dek reads that file, and the sign-in that waits, only when the user owns it and neither the group nor others may read or write it; otherwise it says to `chmod 600` it or delete it, since a key another account could read or plant is no key of the user's. A key kept in the keychain is taken out of the file, so one place holds it. `dekc pub whoami` says where the key came from.

**`DEK_TOKEN` overrides both**, for CI: it is sent as the key, and no store holds it. It is sent only to `https://dek.pub`, or to the server `DEK_TOKEN_SERVER` names; to any other server, as one `--server` names in a script that also sets `DEK_TOKEN`, it is not sent, and the key login kept for that server is used. A `401` on a key from `DEK_TOKEN` says to replace or unset it, rather than to sign in. `logout` revokes and forgets only the key `login` kept; `DEK_TOKEN` is the user's own to unset.

**`DEK_PUB_CREDENTIALS` names the file to keep the key in and leaves the keychain alone.** The tests set it to a temporary path in `tests/setup.ts`, with `DEK_PUB_SERVER` on a closed port and `DEK_TOKEN` unset, so no test reaches the keychain, the home folder, or dek.pub; the fake server in `tests/helpers/fake-pub.ts` sets its own. A user who wants the file can set it too.

**A sign-in that waits is kept beside the credentials**, in `login.json` with the same mode, keyed by origin, with its expiry; an expired one is dropped when next read.

**The key goes only to the server it was made for, and only over HTTPS.** The server is `--server`, else `DEK_PUB_SERVER`, else `https://dek.pub`, reduced to its origin. A plain `http://` server is refused unless it is this machine (`localhost`, `127.0.0.1`, `[::1]`). Every request follows no redirect, so no answer can send the key to another host. The key travels in `x-api-key`, and every request carries `dek-protocol: 1`. Each ID in a path is one encoded segment, so no ID can reach another path.

**Every call has a deadline:** 30 seconds, and 10 minutes for an upload. A call that cannot connect or times out is an error that names the server, with a hint to check the network or pass `--server`; an error dek.pub returns (`{ "error": { "code", "message", "hint" } }`) is printed as its message and hint. The one `fetch` is in `src/core/pub/client.ts`, with the `biome-ignore` that says its signal bounds it.

**What was not chosen:**

- **The file always.** It is the simpler path, and the one every other process the user runs can read.
- **Asking for the key at a prompt in CI.** No dek command prompts.
- **A token in the URL or a cookie jar.** A URL is logged, and a cookie is a browser's way.
- **Following redirects with the key removed.** Fetch keeps a custom header across them; refusing every redirect is simpler to trust.

## Consequences

- The architecture guide, in both languages, says that `ref` and `pub` reach the network, and where the key is kept.
- A user with no keychain gets a file only they may read, and is told so in `whoami` and `login`.
- A dek.pub on another host needs its own sign-in, and a key for it is never sent to dek.pub.
- Running dek.pub on the developer's machine works over plain HTTP; a staging server must have HTTPS.
