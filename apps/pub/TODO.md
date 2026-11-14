# What dek.pub does not do yet

Phases 1 and 2 of the plan are built: publishing from `dekc pub`, the talk page with its viewer and script article, sharing, and review comments that `dekc pub comments` hands back. All of it runs locally on Miniflare, and `bun run test:e2e` covers the round trip. Nothing is deployed.

dek.pub opens first by invitation: only the people it lets in can sign up. dek 0.7.0, the first release with `dekc pub`, comes out once dek.pub runs on its own domain; until then the release-please pull request stays open, though `docs/guide/publish.md` is already on the docs site.

This file lists what is missing, in the order it is needed. Remove an item when the change that does it lands.

## Before dek.pub opens by invitation

### The app

- **Deleting an account** is done by hand on request. The schema has no foreign keys, so each row of the account's is deleted by name: its decks with `deleteDeck` (ADR 82); its keys with `revokeKeysOf` (ADR 83); its `invitations` by `inviter_id` (ADR 84); the `sign_up_invites` it added stay, by `added_by`, as does the one it claimed, which then lets no one in again (ADR 85); its `profile_links`, `likes` and `mutes`, and the grants it holds, by `user_id`; the review threads, replies and public comments it wrote, by `author_id`; and last the account, with its sessions, through Better Auth's adapter.
- **Logs.** A failed query's error carries the values it was bound to: an address, a comment's text. `src/common/log.ts` leaves them out, but two handlers log errors whole: Void's error handler (`createErrorRenderer`'s `onError`), for a page's loader, a route not wrapped in `api()` such as `routes/[profile]/rss.ts` and `routes/sitemap.xml.ts`, and middleware; and Better Auth's adapter when a fallback join fails (`handleFallbackJoin`), which logs the join's conditions and its error, whose value is a user id.

### Terms and the law

- No terms of service, privacy policy, or contact page; the footer has no link to them.
- The privacy policy has to cover what dek.pub keeps of people who never signed up: a grant holds the address it was made for.
- Pages load Google Fonts and GitHub's avatars, which Japan's rule on sending a visitor's data to others (電気通信事業法の外部送信規律) may require dek.pub to disclose. Serving the fonts from dek.pub would leave only the avatars.
- Whether review threads and their mail count as carrying others' messages, which may need a notice to the ministry (電気通信事業の届出), is not checked.

### Staging

Staging runs in the same Cloudflare account as production, deployed with its own tokens: the app on `workers.dev`, and decks and mail on one domain of its own. The steps under "Running it" are taken on staging first, then on production.

- The staging domain is not chosen or registered.
- `infra/site.ts` refuses any stage but `prod`.
- Void has no named environments. It reads `void.config.ts`, `void.lock.json` and `.void/project.json` from the project root, so a second target needs its own root or a config that switches on the stage; which works is not tried.
- `void.config.ts` names the Worker, the R2 bucket and the mail sender (`mail.dek.pub`) for production alone, so staging, in the same account, would bind production's bucket, `dek-pub`. `serve/wrangler.jsonc` has no `env.staging`, and `infra.yml` passes `--stage prod` in every job.
- Staging needs its own GitHub OAuth app and its own secrets.

### Running it

Each of these is needed on staging and on production.

- **Domains.** `dek.pub` and `dekusercontent.com` are not registered. The Public Suffix List request for `dekusercontent.com` is not sent; it takes weeks.
- **Infrastructure.** The zones, settings and wildcard record (`infra/alchemy.run.ts`, ADR 70) and the serve Worker's route are declared but never applied. Alchemy's state store is not made (`alchemy state bootstrap`), and the repository has no `CLOUDFLARE_ACCOUNT_ID` variable, no `CLOUDFLARE_PLAN_TOKEN` or `CLOUDFLARE_DEPLOY_TOKEN`, and no `cloudflare-prod` environment, so `infra.yml` skips every job.
- **Accounts and secrets.** A GitHub OAuth app, and the settings ADR 43 lists set with `void secret put`, less `TURNSTILE_SECRET`, which ADR 61 dropped. `void deploy` makes `BETTER_AUTH_SECRET` itself when the Worker has none. `DEK_PUB_DEV_LOGIN` and `DEK_PUB_OPEN_SIGN_UP` must be unset (ADR 85). `DEK_PUB_OPERATORS` lists the addresses of those who run dek.pub, who may take any talk down and invite people on `/settings` (ADR 82, 85).
- **Deploying.** No script deploys the app and the serve Worker together, and nothing applies `db/migrations/` to the remote D1. There is no way back from a deploy but deploying again.
- **Mail.**
  - Workers Paid and Email Sending onboarding, then `void email setup --platform cloudflare`; until then mail reaches only addresses verified in Email Routing. The token `void deploy` uses needs Email Routing Edit and Email Sending Edit.
  - SPF and DKIM, which `void deploy` writes, checked in a received mail's headers. DMARC is declared in `infra/alchemy.run.ts`; the sending subdomain is quarantined, not rejected, until those headers are checked.
- **Watching it.** No budget alert, and Workers Logs is not turned on. Once on, they keep each request's full URL, so whoever reads them can read the key of every `link` talk opened (ADR 81).
- **Backups.** No restore of D1 (Time Travel) has been tried.
- **A first run.** `dekc pub login`, `publish`, `share`, an invitation, a review thread and `dekc pub comments`, against the deployed server through `DEK_PUB_SERVER` and `DEK_TOKEN_SERVER`.

## Before anyone can sign up

- **Rate limits.**
  - dek.pub's only own limit is on the invitations an owner's grants mail (ADR 84); the API key plugin's is off in `auth.ts`. Nothing else limits `POST /api/cli/key`, `/api/decks/*` or posting a comment.
  - Better Auth's own limits on sign-in, links and the device flow keep their counts in memory, so on Workers each isolate counts alone. Asking for sign-in links is held only by its default, 5 a minute from one client; nothing limits how many addresses are tried.
- **Quotas.**
  - No storage quota per user; the only limit is 50 MiB per version.
  - No limit on new accounts. Invitation alone does not bound them: a grant by address lets that address make an account (ADR 79), which has 20 invitations a day of its own (ADR 84). The accounts grow as a tree from those the operators invite on `/settings` (ADR 85), and one person can grow it through addresses of their own.
- **Abuse.**
  - Nobody can report a talk or a public comment, and there is no block list.
  - The plan's guard against phishing on the deck domain, a limit on what a new account can make public, is not built.
- **Account deletion** by the person themselves, as a section of `/settings`.

## Later

- **Bidi and format characters in names and link labels.** `readName` and a link's label keep U+200B–200F, U+202A–202E and U+2066–2069, so a name or a label can be drawn reversed or hide part of itself.
- **Link keys.**
  - Revoking a grant on a `link` deck does not lock its grantee out without a new link: they keep the key from the address bar or a URL shared with them.
  - A key survives `link` → `private` → `link`, so a URL handed out before opens again (ADR 81).
  - `og:url` carries no key, so a link preview that follows it may open the bare path, a 404.
- **`dekc pub logout --all` with another account's `DEK_TOKEN`**, a CI bot's, revokes that account's keys, then forgets the key `login` kept here without revoking it, since it is another account's (ADR 83).
- **A publish racing a delete** of its deck answers 500, not the 404 of a deck that is gone.
- **Changing a handle.** A handle is chosen once, after the first sign-in, and cannot be changed (ADR 77). Changing one needs redirects from the old `/@handle` URLs, and a rule for when someone else may take the old one.
- **Comments** work from end to end, but their look, their behaviour and their API are expected to change. Do not build on their current details.
  - No notices but mail: no unread marker, nothing in the app. `dekc pub comments` lists review threads only, and no mail tells the owner of a public comment.
  - Comments load with the page; others' appear only after a reload.
  - A review thread or reply cannot be changed or removed by its author, as public comments can (ADR 56). The owner can resolve any thread but cannot hide or delete a review thread.
  - Anchoring: a comment on a quote, and one on a slide made before the deck reported ready, are saved at step `"0"`, and pins are drawn at every beat of their slide (ADR 45). After a publish an element comment's path and box are never checked again (`src/model/comment/anchor.ts`), so the "Moved" and "Changed" badges appear only for quotes and renames.
  - Only the manage page lists the slides a version changed.
  - `dekc pub comments` has no command to share a team thread. The deck's pins show a team thread's bare number, so `T3` and `3` both show as 3.
  - Plain text only: no Markdown, no mentions.
  - On a touch screen the full-screen header comes back only from a tap on the top strip, and nothing checks a real full screen (ADR 58).
  - `listComments` loads every thread and reply at once.
- **Mail:** a digest of a person's notices, muting a project's mail, mail in the reader's language. An invitation is mailed only when its grant is made and never sent again, so a grant made before the mail domain works was never mailed.
- **Projects:** a `dek.toml` key naming a project on dek.pub, which holds its decks, members and settings; grants to a project; `/projects/<id>/<deck>` URLs.
- **Embedding.** The only embeddable URL, `d-<id>.dekusercontent.com/v/<n>/`, returns 404 once a new version is current, so an embed breaks on every publish. No snippet to copy and no oEmbed endpoint.
- **The full build** is uploaded but never served (ADR 47), and the source tar cannot be downloaded.
- **Headers.** The app's CSP holds only `frame-ancestors`, `base-uri` and `object-src`; a full one needs a hash or nonce for the talk page's inline listener (ADR 67).
- **Watching it, beyond logs:** no error tracking, health check or alert.
- **Backups of R2.**
- **Deploying from a workflow:** staging on every push to `main`, production by hand with an approval, as `infra.yml` does for the zones.
- **Search.** The plan's D1 FTS5 index is not built.
- **Every request with an API key writes to D1.** Better Auth's API key plugin records each use.
- **The e2e publish race** (`tests/e2e/run.ts`, two publishes on one base) has now and then failed on a 409 with another message, and passed when run again.
- **Checks a browser test does not make:** accessibility (axe), a phone's width, how fast a page loads.
- **The footer's Source link** goes to the repository's front page, not to the commit that is running.
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
  - where a live room keeps its state
  - storage limits per plan
  - whether the deck's CSP applies to a local `dekc build` too
  - pricing
  - how success is measured
