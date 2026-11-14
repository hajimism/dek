# What dek.pub does not do yet

Phases 1 and 2 of the plan are built: publishing from `dekc pub`, the talk page with its viewer and script article, sharing, and review comments that `dekc pub comments` hands back. All of it runs locally on Miniflare, and `bun run test:e2e` covers the round trip. Nothing is deployed.

dek.pub opens first by invitation: only the people it lets in can sign up. dek 0.7.0, the first release with `dekc pub`, comes out once dek.pub runs on its own domain; until then the release-please pull request stays open, though `docs/guide/publish.md` is already on the docs site.

This file lists what is missing, in the order it is needed. Remove an item when the change that does it lands.

## Before dek.pub opens by invitation

### The app

- **Deleting an account** is done by hand on request, its decks with `deleteDeck` (ADR 82).
- **Invitations.** An owner can grant any address, and each grant mails an invitation carrying the deck's title, which the owner chose. Nothing limits how many, so dek.pub can be made to mail strangers words of someone else's choosing.
- **Logs.** An error a page's loader throws is logged whole by Void's error handler, and a failed query's error carries the values it was bound to: an address, a comment's text. Void has no hook to log it otherwise; `src/common/log.ts` does so for the API, the tasks after an answer, mail and Better Auth.

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
- `void.config.ts` names the Worker and the mail sender (`mail.dek.pub`) for production alone; `serve/wrangler.jsonc` has no `env.staging`; `infra.yml` passes `--stage prod` in every job.
- Staging needs its own GitHub OAuth app and its own secrets.

### Running it

Each of these is needed on staging and on production.

- **Domains.** `dek.pub` and `dekusercontent.com` are not registered. The Public Suffix List request for `dekusercontent.com` is not sent; it takes weeks.
- **Infrastructure.** The zones, settings and wildcard record (`infra/alchemy.run.ts`, ADR 70) and the serve Worker's route are declared but never applied. Alchemy's state store is not made (`alchemy state bootstrap`), and the repository has no `CLOUDFLARE_ACCOUNT_ID` variable, no `CLOUDFLARE_PLAN_TOKEN` or `CLOUDFLARE_DEPLOY_TOKEN`, and no `cloudflare-prod` environment, so `infra.yml` skips every job.
- **Accounts and secrets.** A GitHub OAuth app, and the settings ADR 43 lists set with `void secret put`, less `TURNSTILE_SECRET`, which ADR 61 dropped. `void deploy` makes `BETTER_AUTH_SECRET` itself when the Worker has none. `DEK_PUB_DEV_LOGIN` must be unset. `DEK_PUB_INVITED` lists the people invited, and holds `*` only once every item under "Before anyone can sign up" is done (ADR 79). `DEK_PUB_OPERATORS` names the handles of those who run dek.pub, who may take any talk down (ADR 82).
- **Deploying.** No script deploys the app and the serve Worker together, and nothing applies `db/migrations/` to the remote D1. There is no way back from a deploy but deploying again.
- **Mail.**
  - Workers Paid and Email Sending onboarding, then `void email setup --platform cloudflare`; until then mail reaches only addresses verified in Email Routing. The token `void deploy` uses needs Email Routing Edit and Email Sending Edit.
  - SPF and DKIM, which `void deploy` writes, checked in a received mail's headers. DMARC is declared in `infra/alchemy.run.ts`; the sending subdomain is quarantined, not rejected, until those headers are checked.
- **Watching it.** No budget alert, and Workers Logs is not turned on.
- **Backups.** No restore of D1 (Time Travel) has been tried.
- **A first run.** `dekc pub login`, `publish`, `share`, an invitation, a review thread and `dekc pub comments`, against the deployed server through `DEK_PUB_SERVER` and `DEK_TOKEN_SERVER`.

## Before anyone can sign up

- **Rate limits.**
  - None of dek.pub's own; the API key plugin's is off in `auth.ts`. Nothing limits `POST /api/cli/key`, `/api/decks/*` or posting a comment.
  - Better Auth's own limits on sign-in, links and the device flow keep their counts in memory, so on Workers each isolate counts alone. Asking for sign-in links is held only by its default, 5 a minute from one client; nothing limits how many addresses are tried.
- **Quotas.** No storage quota per user and no limit on new accounts; the only limit is 50 MiB per version.
- **Abuse.**
  - Nobody can report a talk or a public comment, and there is no block list.
  - The plan's guard against phishing on the deck domain, a limit on what a new account can make public, is not built.
- **Account deletion** by the person themselves, as a section of `/settings`.

## Later

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
- **Mail:** a digest of a person's notices, muting a project's mail, mail in the reader's language. An invitation is never sent again.
- **Projects:** a `dek.toml` key naming a project on dek.pub, which holds its decks, members and settings; grants to a project; `/projects/<id>/<deck>` URLs.
- **Embedding.** The only embeddable URL, `d-<id>.dekusercontent.com/v/<n>/`, returns 404 once a new version is current, so an embed breaks on every publish. No snippet to copy and no oEmbed endpoint.
- **The full build** is uploaded but never served (ADR 47), and the source tar cannot be downloaded.
- **Headers.** The app's CSP holds only `frame-ancestors`, `base-uri` and `object-src`; a full one needs a hash or nonce for the talk page's inline listener (ADR 67).
- **Watching it, beyond logs:** no error tracking, health check or alert.
- **Backups of R2.**
- **Deploying from a workflow:** staging on every push to `main`, production by hand with an approval, as `infra.yml` does for the zones.
- **Search.** The plan's D1 FTS5 index is not built.
- **Every request with an API key writes to D1.** Better Auth's API key plugin records each use.
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
