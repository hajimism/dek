# 19. Keep dependency code away from the tokens that publish

Date: 2026-10-22

## Status

Accepted

Amends [3. Release through release-please and npm trusted publishing](0003-release-through-release-please-and-npm-trusted-publishing.md)

## Context

The npm attacks of the past year take over a maintainer's account, publish a version that runs code on install or on use, and are found and pulled within hours or days. Whoever installs in that window runs the attacker's code with whatever the job holds.

dek's workflows already pin every action to a commit, give each token the least it needs, install from the lockfile, and run no lifecycle script of a dependency it does not trust. Three places still gave dependency code more than it needed:

- **The `publish` job held `id-token: write`, the right to mint the token npm publishes with, while it installed and ran dependencies.** `scripts/check-package.sh` ran `bunx publint@0.3`, which fetches the newest 0.3.x at release time, outside the lockfile, and installed the tarball into a fresh project, which resolves its dependencies afresh. A hijacked publint or zod published that morning could have published a dek of its own, with provenance.
- **The Pages `build` job held `pages: write` and `id-token: write`** while it installed dependencies, Chromium, and built the docs. Only `deploy` needs them.
- **Nothing kept a version from being taken the hour it was published.** Dependabot waits three days by default; `bun add` and `bun update` on a contributor's machine do not wait at all. CI also fetched rumdl with no checksum, and every checkout left the job's token in `.git/config` for the steps after it.

## Decision

**Releasing is two jobs.** `pack` checks out the tag, installs from the lockfile, runs `scripts/check-package.sh package`, and uploads the tarball it checked as an artifact. It has no `id-token`. `publish` holds `id-token: write` in the `npm` environment, as before, but checks out nothing and installs nothing: it sets up Node, downloads the artifact, whose digest `actions/download-artifact` checks, and runs `npm publish package/*.tgz --ignore-scripts`. The tarball npm receives is the one that was checked, byte for byte.

**publint comes from the lockfile.** It is a devDependency at an exact version, and `check-package.sh` runs it from `node_modules`. knip is told it is used, since only the shell script uses it. Given a directory, the script leaves the tarball it checked there.

**Pages' write permissions belong to `deploy` alone.** The workflow grants `contents: read`; `build` adds `pages: read` for `configure-pages`, and `deploy` gets `pages: write` and `id-token: write`.

**New versions wait a week.** `bunfig.toml` sets `[install] minimumReleaseAge` to seven days, and `.github/dependabot.yml` sets `cooldown: default-days: 7` for both ecosystems. Security updates from Dependabot do not wait. A contributor who needs a newer version sooner names it in `minimumReleaseAgeExcludes` for that change, as `CONTRIBUTING.md` says.

**Every download is checked and no checkout keeps its token.** rumdl is fetched to a file and checked against its SHA-256, as adrs already is. Every `actions/checkout` sets `persist-credentials: false`.

Two settings that harden this further live outside the repository and are the maintainer's to set: a required reviewer on the `npm` environment, so a release waits for a person, and, on npm, publishing access that requires two-factor authentication and refuses tokens, so trusted publishing is the only way to publish.

## Consequences

A hijacked dependency that lands in a release's lockfile can still run in `pack`, but it cannot publish: no job that runs dependency code can mint the token. A version newer than a week does not reach a contributor's machine or a Dependabot PR, and the window most attacks are found in passes first.

A fix published today waits a week unless someone excludes it by hand. A release takes a little longer, two jobs instead of one, and `check-package.sh` must leave the tarball where `pack` uploads it from. The bunfig setting covers this repository only; projects that `dekc init` writes do not get it.
