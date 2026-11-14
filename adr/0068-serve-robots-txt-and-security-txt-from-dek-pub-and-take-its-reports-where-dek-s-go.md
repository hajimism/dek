# 68. Serve robots.txt and security.txt from dek.pub, and take its reports where dek's go

Date: 2026-11-14

## Status

Accepted

## Context

dek.pub answered `/robots.txt` and `/.well-known/security.txt` with its 404 page. Pages that should not be found already say `noindex` (sign-in, the device page, a talk that is not public), but a staging configuration (ADR 43) would be the same app on another origin, and nothing would keep crawlers off it.

Someone who finds a hole in dek.pub has nowhere on the site to report it. `SECURITY.md` asks for reports through GitHub's private advisories, and its scope names the CLI and the dev server only, not the server in `apps/pub`.

## Decision

**`/robots.txt` is a route, `routes/robots.txt.ts`,** whose text `robotsFor` in `src/shell/robots.ts` makes from `APP_ORIGIN`. On `https://dek.pub` it lets every crawler in but `/api/`; on any other origin, staging or a machine's, it keeps them all out with `Disallow: /`. Pictures under `/i/` stay open, as link previews fetch them. It names no sitemap, since there is none yet.

**`/.well-known/security.txt` is a static file in `public/`,** as RFC 9116 asks: `Contact` is the repository's new-advisory URL, `Policy` is `SECURITY.md` on `main`, `Preferred-Languages` is `en, ja`, and `Canonical` is its own URL on dek.pub. `Expires` is under a year away. A unit test fails when it has less than 30 days left, so CI says when to renew it.

**`SECURITY.md`'s scope names dek.pub and the serve Worker:** reaching a deck, a version, a comment, a grant or an account one was not given; a deck's code reaching the app's origin or another deck; a key or a sign-in link working for someone else; and making dek.pub send mail or store data far past one account's share. Reports a scanner made with no way to use them, and testing that slows dek.pub for others, are out of scope. Reports go where dek's go, so there is one place to watch.

**What was not chosen:**

- **A static `robots.txt`.** It would say the same on staging as on dek.pub.
- **A security.txt route that computes `Expires`.** It would never go stale, which is what the field is there to show.
- **A mail address for reports.** It needs a mailbox someone reads; GitHub's advisories keep the report private and the fix beside it.

## Consequences

- The e2e run checks that `/robots.txt` on `vp dev` keeps crawlers out and that `security.txt` names a contact; the unit tests check the production text and the expiry.
- Renewing `security.txt` is a one-line change once a year, prompted by a failing test.
- A sitemap, when dek.pub has one, adds a `Sitemap:` line on dek.pub's origin only.
