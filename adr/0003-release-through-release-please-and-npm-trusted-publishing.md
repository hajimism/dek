# 3. Release through release-please and npm trusted publishing

Date: 2026-10-01

## Status

Accepted

## Context

dek is published to npm. A release needs a version, a changelog, a tag, and a publish, and a token kept in the repository for publishing is a secret that can leak. `bun publish` cannot authenticate over OIDC.

## Decision

Releases come from `main` (6525c88). Commit messages follow Conventional Commits, and release-please reads them to keep a release PR open. Merging that PR tags the version, writes CHANGELOG.md and the GitHub Release, and runs the `publish` job in `.github/workflows/release.yml`.

That job publishes with `npm publish` through npm's trusted publishing, which needs no token and attaches provenance. Trusted publishing needs npm 11.5.1 or later, which the latest Node 24 bundles, so the job takes Node 24 with `check-latest` instead of installing npm (acc6f50). Before publishing, `scripts/check-package.sh` installs the packed tarball the way the docs say and runs `dekc` from it; CI runs it too.

While dek is 0.x, a breaking change bumps the minor version and anything else bumps the patch (`bump-minor-pre-major`, `bump-patch-for-minor-pre-major` in `release-please-config.json`).

## Consequences

No publishing secret exists to leak, and every release carries provenance. A tarball that would not install or run is never published.

The commit messages are the release notes, so they must be written for users and typed correctly: a breaking change without `!` ships as a patch. Bun is still the runtime and the package manager; only the publish step needs Node.
