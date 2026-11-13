# What dek.pub does not do yet

Phases 1 and 2 of the plan are built: publishing from `dekc pub`, the talk page with its viewer and script article, sharing, and review comments that `dekc pub comments` hands back. All of it runs locally on Miniflare, and `bun run test:e2e` covers the round trip. Nothing is deployed.

This file lists what is missing or only partly there. Remove an item when the change that does it lands.

## Comments are still taking shape

**The comment experience is still taking shape.** It works from end to end, but its look, its behaviour and its API are expected to change. Do not build on its current details.

What it does not do:

- **Notifications.** No one hears that a comment arrived: no email, no unread marker, nothing in the app.
- **Live updates.** Comments load with the page. Others' comments appear only after a reload; only your own are merged in as you post them.
- **Editing and deleting.** Nobody can edit or delete a comment or a reply, and the API has no routes for it.
- **Moderation.** The owner can resolve any thread but cannot hide or delete one. A guest cannot resolve or reopen their own thread, because resolving needs a signed-in account.
- **Guest identity.** A guest's name is remembered in the browser (`dek-pub:guest-name`). Nothing ties a guest to their earlier comments.
- **Anchoring to beats.** An element comment keeps the beat it was picked at. A comment on a quote, and one on a slide made before the deck reported ready, are saved at step `"0"`. Pins are drawn at every beat of their slide (ADR 45).
- **Re-anchoring after a publish** (`src/model/comment/anchor.ts`).
  - Quotes are searched for again, and renames are followed.
  - An element comment's path and box are never checked again. When its slide's HTML changes, the comment stays `open`, still pointing at the old box. It becomes `moved` only through a rename, and never `detached`.
  - So the "Moved" and "Changed" badges appear only for quotes and renames.
- **Versions.** There is no way to see comments where they sat on an older version. The API's `?version=` filter is used by neither the CLI nor the pages.
- **What changed.** Only the manage page lists the slides a version changed. The talk page does not mark changed slides for someone coming back to review.
- **Text.** Comments are plain text: no Markdown, no mentions.
- **Scale.** `listComments` loads every thread and reply at once. The card folds long threads only in the browser.
- **Drafts.** A draft is lost on reload.
- **Turnstile setup.**
  - `TURNSTILE_SITE_KEY` (`env.ts`) is missing from `dev.env` and from ADR 43's list of production settings.
  - The composer shows the widget only when the site key is set, yet the server asks for a token whenever `TURNSTILE_SECRET` is not `off`. With the secret set and no site key, a guest cannot comment.
  - No e2e check posts as a guest.

## Gaps in phases 1 and 2

- **API keys.**
  - Each `dekc pub login` makes a key that lasts a year.
  - `logout` revokes only the key it holds. Nothing lists a user's keys or revokes the others.
  - There is no account or settings page.
- **The full build** is uploaded but never served. No one, not even the owner, can read the whole script with its directions in the browser (ADR 47). The source tar cannot be downloaded.
- **Embedding.**
  - The only embeddable URL, `d-<id>.dekusercontent.com/v/<n>/`, names one version, and it returns 404 once a new version is current, so an embed breaks on every publish.
  - There is no snippet to copy and no oEmbed endpoint.
- **Versions.**
  - The CLI has no `versions` or `promote` command.
  - The talk page shows the current version, so the owner cannot preview a `--no-promote` upload there before promoting it.
  - Versions cannot be deleted.
- **Grants.**
  - Grants are made on the manage page only; the CLI has no command for them, though `src/pub/protocol.ts` has their paths.
  - An email grant sends no invitation, since there is no mail provider.
- **Deleting.** There is no way to delete a talk or an account.
- **Handles.**
  - A handle comes from the GitHub login or the email, and must be unique. A second account whose handle normalizes to one already taken fails to sign up.
  - A link-visibility talk's URL is its readable `/@handle/slug`, so anyone who guesses it can open it.
- **Profile.** The profile page lists every talk with no pagination; RSS stops at 50.

## Running it for real

- **Accounts and secrets.** A GitHub OAuth app, and the settings ADR 43 lists set with `void secret put`, plus `TURNSTILE_SITE_KEY`. `DEK_PUB_DEV_LOGIN` must be unset.
- **Domains.**
  - `dek.pub` and `dekusercontent.com` are not registered.
  - `serve/wrangler.jsonc` has no routes for `d-*.dekusercontent.com`, and there is no wildcard DNS.
  - The Public Suffix List request is not sent.
- **Deploying.** There is no staging configuration (ADR 43), no HTTPS staging server for the CLI to talk to (ADR 48), and no deploy workflow. CI only checks, tests and builds.
- **Limits and abuse.**
  - No rate limits; the API key plugin's own is off in `auth.ts`.
  - No storage quota per user, and no limit on new accounts.
  - The only limit is 50 MiB per version.
  - Nobody can report a talk, and there is no block list.
  - The plan's guard against phishing on the deck domain, a limit on what a new account can make public, is not built.
- **Search.** No search; the plan's D1 FTS5 index is not built.
- **Every request with an API key writes to D1.** Better Auth's API key plugin records each use.
- **`.dek/renames.json` only grows.** When `.dek/` is ignored by git, another checkout does not have the renames (ADR 49).

## Later phases

- **Phase 3, presenting over the network:**
  - a live room for each talk (a Durable Object)
  - a phone as remote by QR code, and audience screens that follow the slides
  - the presenter view in the cloud, from the full build
  - time measured per section, against the budget
  - publishing at a set time (`dekc pub share --at`, not yet a flag)
- **Phase 4, fixing on the web:**
  - a script editor, with a pinned `dekc` building in a Cloudflare Sandbox
  - source history and `dekc pub pull`, syncing either to Cloudflare Artifacts or as pull requests to the author's GitHub (not yet decided)
  - changing slides by instruction
- **Open questions:**
  - whether guests may comment at all
  - where a live room keeps its state
  - storage limits per plan
  - whether the deck's CSP applies to a local `dekc build` too
  - pricing
  - how success is measured
