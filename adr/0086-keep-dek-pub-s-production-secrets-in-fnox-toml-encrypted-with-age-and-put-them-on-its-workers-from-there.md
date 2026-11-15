# 86. Keep dek.pub's production secrets in fnox.toml, encrypted with age, and put them on its Workers from there

Date: 2026-11-15

## Status

Accepted

## Context

dek.pub's production values are Worker secrets: the app's are set with `void secret put`, the serve Worker's with `wrangler secret put` (ADR 43, 70). Both stores take a value and never return it, and so do GitHub Actions' secrets. Nothing holds the values themselves. Whoever sets them again, after a rotation, for a Worker made anew, or for staging, which needs a set of its own, has to have kept them somewhere. `SERVE_TOKEN_SECRET` must also be the same on both Workers, which two commands typed by hand do not ensure.

Only production needs real values. A local run reads `.env`, written from `dev.env` (ADR 43), and the e2e server sets its own; `ci.yml` uses no secrets.

dek.pub uses no password manager or cloud secret store, so the comparison on 2026-11-15 was about where the values live:

- **fnox** (jdx, MIT, installed by mise like the rest of the toolchain). It reads `fnox.toml` from the current directory and its parents, resolves each secret through the provider it names, and hands the values to a command. A provider must be readable, so neither GitHub nor Cloudflare can be one. Since 1.46, `fnox push` copies values into write-only stores, Cloudflare Workers and GitHub Actions among them; its `cloudflare-workers` target runs `wrangler secret put` with the value on stdin. Its `age` provider keeps each value encrypted in `fnox.toml` itself, to public keys listed there.
- **The OS keychain alone.** Nothing enters the repository, but the values stay on one machine with no copy and no list of which ones production needs.
- **A password manager or a cloud secret store** (1Password, Bitwarden, AWS or Google's). Each is an account and a service to set up for four values, and fnox can read any of them later.
- **Nothing,** as today.

Trying fnox 1.47.0 turned up two ways a value changes on the way to the app's Worker. `fnox get` prints a newline after the value, and `void secret put` keeps every byte it reads on stdin, so a pipe from one to the other stores the newline as well. `fnox export` writes a dotenv file that escapes `"` with a backslash inside double quotes, and `void secret sync` reads the file with Node's `util.parseEnv`, which takes the backslash literally: a value holding both kinds of quote arrives cut short.

## Decision

**dek.pub's production values live in `apps/pub/fnox.toml`, encrypted with age.** mise installs fnox 1.47.0, the newest release at least a week old (ADR 19). The file has one provider, `age`, whose `recipients` are the public keys of those who may read the values; each private key stays outside the repository, in `~/.config/fnox/age.txt` or the `FNOX_AGE_KEY` variable.

**Every value is in the profile `prod`, named after Alchemy's stage (ADR 70), and the default profile holds nothing.** fnox's shell integration loads the default profile when someone enters `apps/pub`, so it loads nothing there, and `dev.env` stays the only source of local values. Each value has `if_missing = "error"`, so `fnox -P prod check` names any value not stored yet. A staging profile comes with the staging configuration ADR 43 asks for, with its own values and targets.

**What `prod` holds:** `SERVE_TOKEN_SECRET`, `AUTH_GITHUB_CLIENT_ID`, `AUTH_GITHUB_CLIENT_SECRET` and `DEK_PUB_OPERATORS`. Void takes every server value `env.ts` declares from a Worker secret in production, so a setting that is not secret, such as `FEATURED_TALK`, is added here when it is first set; `APP_ORIGIN` and `DECK_ORIGIN` keep their defaults. It never holds `DEK_PUB_DEV_LOGIN` or `DEK_PUB_OPEN_SIGN_UP`, which production keeps unset (ADR 85), or `BETTER_AUTH_SECRET`, which `void deploy` made and which a new value would replace, signing everyone out.

**Each Worker's secrets keep the owner ADR 70 gave them; fnox only supplies the values.** `bun run secrets` (`apps/pub/scripts/secrets.ts`):

1. reads `fnox -P prod export --format json`, which fails while any value is missing;
2. refuses the names production never gets (`appSecrets` in `scripts/app-secrets.ts`, with a unit test);
3. names the values and asks before going on;
4. puts each one on the app's Worker with `void secret put`, writing the value to stdin exactly as fnox resolved it;
5. runs `fnox -P prod push`. Its target `serve` runs `wrangler secret put NAME --name dek-pub-serve`, with the wrangler the serve Worker depends on. Only `SERVE_TOKEN_SECRET` lists that target, so both Workers get the same value from one source.

`fnox push` is not used for the app's Worker, since wrangler would skip the check `void secret put` makes against `env.ts` before uploading. The script does not pipe `fnox export` into `void secret sync`, because of the quoting found above.

**CI does not run fnox.** `ci.yml` stays free of secrets, and no workflow holds an age key. The Cloudflare tokens in GitHub Actions (ADR 70) are not in `fnox.toml` either: they are made in Cloudflare and replaced rather than recovered. A `github-actions` target can push them later if that changes.

**What was not chosen:**

- **The keychain alone.** No copy, nothing to share with a second operator, and no list of what production needs.
- **A password manager or a cloud store.** Worth it once dek.pub has a team or an account there; moving means changing the provider of each value in `fnox.toml`, and the script stays as it is.
- **`fnox push` for both Workers.** It is simpler, but loses Void's check, and ADR 70 leaves the app's Worker to Void.

## Consequences

- One command sets or rotates every production value, and one run gives both Workers the same `SERVE_TOKEN_SECRET`. Between its fourth and fifth steps the app's Worker has the new value and the serve Worker the old one, and a run stopped there, by a refused push or a failed one, leaves them apart until the next run.
- The repository is public, so the ciphertext and the names of the values are public for good. If a private key leaks, making a new key is not enough: every value has to be replaced, since the old ciphertext stays in git history.
- If every private key is lost, the values cannot be read. Each key needs a copy kept away from the machine.
- Adding a reader means adding their public key and running `fnox reencrypt`. Removing one also means replacing the values they could read.
- Every `void secret put` and `wrangler secret put` deploys a new version of its Worker, so one run makes as many versions as it sets values.
- The script needs `void`'s Cloudflare sign-in for the app's Worker and `wrangler login` for the serve Worker: two sign-ins, as deploying the two already needs.
- A `fnox.toml` in a parent directory of `apps/pub` would be merged into this one. The repository has none.
- Nothing here has run against an account, and no value is stored yet.
