# 92. Serve dek.pub's app from a Workers Custom Domain declared in void.config.ts, and from no workers.dev URL

Date: 2026-11-15

## Status

Accepted

## Context

ADR 70 gives each Cloudflare resource of dek.pub one owner. Alchemy holds the zones, their settings and the records no deploy writes; `void deploy` holds the app's Worker, D1, R2 and the mail domain's records; `wrangler deploy` holds the serve Worker and its route on `*.dekusercontent.com/*`. Nothing gave the app's Worker its hostname. `void.config.ts` named no route, `alchemy.run.ts` declares no record at the apex of `dek.pub`, and `env.ts` already takes `https://dek.pub` as `APP_ORIGIN`. The first deploy needs one.

Void 1.6.2 offers two ways, both ending in the same place:

- **`routes` under `cloudflare` in `void.config.ts`.** Void passes them through to the Worker, and `void deploy` pins them as a whole. A route with `custom_domain: true` is a Workers Custom Domain: Cloudflare writes the hostname's DNS record and issues its certificate, in a zone of the same account.
- **`void domain add dek.pub`.** For a project deployed straight to Cloudflare, it adds the same `custom_domain` route and synchronizes routes at once. `void domain list` reads the routes back from `void.config.ts`.

The alternatives were a proxied record at the apex declared in Alchemy with an ordinary route, which splits one hostname between two tools, or the dashboard, which leaves nothing to review.

Left at its defaults, the Worker would also answer on `dek-pub.<account>.workers.dev` and on a preview URL for each version. Void's auth takes the request's origin, the CLI and the pages expect `https://dek.pub`, and `robots.ts` tells every other origin `Disallow: /`. A second origin would be a copy of the app with its own cookies and a sign-in whose callback GitHub does not know.

## Decision

**`void.config.ts` declares the app's hostname as `routes: [{ pattern: "dek.pub", custom_domain: true }]`, with `workers_dev: false` and `preview_urls: false`.** `void deploy` is the owner of the route, the DNS record Cloudflare makes for it and its certificate, as it is of the Worker. Alchemy declares nothing at the apex, so no two tools write the same record. `void domain add` is not used, so the hostname changes only through a reviewed edit of `void.config.ts`.

**Before the first deploy, the zone's apex holds no record of its own.** A Custom Domain refuses a hostname that already has an A, AAAA or CNAME record. Records a registrar or Cloudflare's import left behind are removed by hand, once.

**`www.dek.pub` is not served.** Nothing links to it, and adding it later is one more route.

**Void checks a new version through the Custom Domain.** With no `workers.dev` URL, readiness is checked on the first route. On the first deploy, while the certificate is being issued, the check can time out; the deploy is run again once `https://dek.pub/__void/ready` answers.

## Consequences

- `https://dek.pub` is the app's only origin. A version can be reached before it takes traffic only through a deploy of its own, not a preview URL.
- `void deploy` needs Workers Scripts and Workers Routes edit, and DNS and SSL on the `dek.pub` zone, which its login session has.
- Staging, when it comes, names its own hostname in its own Void configuration (ADR 43).
- `void.config.ts` is now the one place to read where the app answers. `env.ts`'s `APP_ORIGIN` default, `robots.ts` and the serve Worker's `APP_ORIGIN` must agree with it; `infra/site.test.ts` checks only the last two against `site.ts`.
