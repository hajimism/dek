# 41. Build the docs on VitePress 2, and drop the root vite override

Date: 2026-11-12

## Status

Accepted

## Context

The docs are built with VitePress 1.6.4, which depends on Vite 5. Vite 5 has no fix for GHSA-4w7w-66w2-5vf9, GHSA-fx2h-pf6j-xcff and GHSA-v6wh-96g9-6wx3, and the esbuild it brings has none for GHSA-67mh-4wv8-2f99. Commit b39dcd6 answered that with `"overrides": { "vite": "^6.4.3" }` in the root `package.json` and in `sample/package.json`. VitePress 1.6.4 builds on Vite 6.

An override on the bare name `vite` applies to every package in the install. The server for dek.pub (`apps/pub`) is built with Vite 8 through Vite+, and Svelte's Vite plugin 7 requires Vite 8. With the override in place, `apps/pub` could not join the root install: every Vite in it would be forced to 6.

VitePress 2 depends on Vite `^8.3.4` and `@vitejs/plugin-vue` `^6.0.9`. Its latest release is `2.0.0-alpha.21` (2026-10-25). The docs use only `docs/.vitepress/config.ts`, the default theme, and local search: no custom theme, no Vue components, and no `vite` key, so little of the API that changed between 1 and 2 is in use.

## Decision

**The docs are built with VitePress `2.0.0-alpha.21`, pinned exactly.** An alpha may change between releases, so a newer one is taken on purpose, through a Dependabot pull request that CI builds.

**The root `package.json` and `sample/package.json` have no `overrides`.** Every Vite in the install is 8.x, which has the fixes the override was for.

**Links to the built samples are written without the base.** VitePress 2 prepends the site's base (`/dek/`) to an absolute link that has `{target="_self"}`, which VitePress 1 left as written. `docs/samples.md` and its Japanese copy link to `/samples/<deck>.html`, and the site serves them at `/dek/samples/<deck>.html` as before.

**What was not chosen:**

- **Scoping the override to `"vitepress>vite": "^6.4.3"`.** It keeps VitePress 1, and `bun install` on Bun 1.4.0 and 1.4.4 resolves Vite 6 under VitePress and Vite 8 elsewhere. It also rewrites `bun.lock` to lockfile version 3, which Dependabot has not been checked against, and it keeps a Vite 6 in the tree for as long as VitePress 1 is used.
- **Moving the docs into a package of their own, with their own lockfile.** It would isolate the override, at the cost of a second install, a second Dependabot entry, and a second place where `minimumReleaseAge` must be set.

## Consequences

- The repository has one Vite major, 8, and `apps/pub` can be a member of the root workspace.
- The docs depend on an alpha. A regression in VitePress 2 shows up in `bun run docs:build`, which CI runs on every pull request; it does not reach the CLI, whose package does not include VitePress.
- If VitePress 2 stops building the docs before it is stable, the scoped override above is the fallback. It brings back the lockfile question.
- `sample/bun.lock` changes with the root one, since the sample installs this checkout through `file:..`.
