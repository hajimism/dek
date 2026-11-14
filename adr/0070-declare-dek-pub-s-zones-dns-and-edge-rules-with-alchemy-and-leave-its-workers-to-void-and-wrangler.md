# 70. Declare dek.pub's zones, DNS and edge rules with Alchemy, and leave its Workers to Void and wrangler

Date: 2026-11-14

## Status

Accepted

## Context

dek.pub's Workers are already code. `void.config.ts` names the app's Worker, its D1 database, its R2 bucket and its mail sender, and `void deploy` provisions and binds them (ADR 43, 53). `serve/wrangler.jsonc` names the serve Worker and the bucket it reads, and `wrangler deploy` uploads it. Neither has run against an account yet.

Everything around the Workers is not code, and most of it does not exist yet:

- the zones `dek.pub` and `dekusercontent.com`
- a proxied wildcard record so `d-<id>.dekusercontent.com` reaches the serve Worker
- DMARC and any mail records `void deploy` does not write for `mail.dek.pub`
- zone settings: HTTPS only, the lowest TLS version
- WAF and rate limiting rules at the edge, if the rate-limit decision puts any there
- the same again for a staging configuration

Made by hand in the dashboard, none of this can be reviewed, repeated for staging, or checked for edits made since. Three ways to declare it were compared on 2026-11-14:

- **Cloudflare's `cf` CLI** (open beta since 2026-09-28, the planned successor to wrangler). `cloudflare.config.ts` declares a Worker, its bindings, routes and custom domains. Zones, DNS records and WAF rules are reached only by one-off commands such as `cf dns records create`; the docs show no plan, state or drift check. Void 1.6.2 deploys through wrangler and does not read `cloudflare.config.ts`.
- **Terraform with Cloudflare's provider.** Stable and complete for zones, records, rulesets and settings. It brings HCL into a repository that is otherwise TypeScript, and a state backend set up apart from the code.
- **Alchemy** (Apache-2.0). Infrastructure as a TypeScript program on Effect, run by Bun. Its Cloudflare provider has resources for zones and zone settings (`Cloudflare.Zone`), DNS records (`Cloudflare.DNS.Record`), rulesets (`Cloudflare.Ruleset`), email routing and DMARC reports (`Cloudflare.Email`), Worker routes and the registrar. `alchemy plan` shows a diff before `alchemy deploy` applies it, `alchemy drift` re-reads the account and exits 2 when something was changed by hand, and a resource that already exists is taken over only with `adopt(true)`. Version 2 is a beta released about once a week; on 2026-11-14 the newest one at least seven days old (ADR 19) is `2.0.0-beta.85`.

## Decision

**What no deploy command writes is declared with Alchemy; what one does stays with it.** One owner for each resource, so no two tools rewrite the same record:

| Resource | Declared in | Applied by |
|---|---|---|
| The app's Worker, D1, R2, mail sender, secrets | `void.config.ts`, `void secret put` | `void deploy` |
| The serve Worker, its bucket binding, its routes | `serve/wrangler.jsonc`, `wrangler secret put` | `wrangler deploy` |
| Zones, DNS records, zone settings, rulesets | `apps/pub/infra/alchemy.run.ts` | `alchemy deploy` |

The serve Worker's route moves into `wrangler.jsonc` as `*.dekusercontent.com/*`, since a route pattern takes a wildcard only at the start of the host; the Worker already answers 404 to any host that is not `d-<id>`. Alchemy declares the proxied record that route needs. The records `void deploy` writes for the mail domain are left to it; which those are is read from the account after the first deploy, and Alchemy declares only the rest, DMARC at least.

**Registering a domain stays by hand.** A purchase is not something a deploy should do. Alchemy takes each zone over with `adopt(true)` once it exists, and retains it: destroying the stack never deletes a zone.

**`apps/pub/infra` is a workspace member,** private and AGPL-3.0 like the rest of `apps/pub`, with one file, `alchemy.run.ts`, and `alchemy`, `@alchemy.run/cloudflare`, `effect` and `@effect/platform-bun` pinned exactly. Nothing else in the repository imports from it, and it imports nothing from `apps/pub/src`, so Effect stays out of the app and the CLI. It starts on `2.0.0-beta.85`, and moves only by a Dependabot pull request.

**One program, two stages: `prod` and `staging`.** The stage chooses the hostnames; the staging names are settled with the staging configuration ADR 43 asks for. Each stage is deployed with its own profile, so the account each reaches is named where it is deployed.

**State is kept in the account, with `Cloudflare.state()`:** a state Worker with a Durable Object, its token and encryption key in the account's Secrets Store. It is made once, by hand, with `alchemy state bootstrap`; a CI run that finds none fails rather than making one.

**CI runs Alchemy in its own workflow, `infra.yml`, as `apps/pub/infra` changes:**

- On a pull request from this repository, `alchemy plan --stage prod`, with a read-only token, so the diff is part of the review. A fork's pull request gets no plan, since it gets no secrets.
- Deploying is `alchemy deploy --stage <stage>` from `main`, started by hand (`workflow_dispatch`), in a GitHub environment that holds the deploy token and asks for an approval for `prod`.
- Once a week, `alchemy drift --stage prod`; exit 2, an edit made outside the program, fails the run.

The tokens are account-owned and hold only the permission groups these commands need, found on the first run and written into the workflow's comments.

**What was not chosen:**

- **`cf`.** It does not yet declare zones, DNS or rules, and has no plan. It is worth looking at again once it does, or once Void deploys through it.
- **Terraform.** As complete, and stable. Chosen against for HCL beside TypeScript and a state backend of its own. The resources are few, so moving to it later is a rewrite of one file.
- **Alchemy for the Workers too.** `void deploy` provisions and uploads the app's Worker; a second tool declaring it would fight over the same script and bindings.
- **The dashboard by hand.** Nothing to review, nothing to repeat for staging, and nothing to notice a change.

## Consequences

- A DNS or rule change is a pull request whose plan is in the review, and staging gets the same records by its stage.
- Adding a record, a setting or a rule edits `alchemy.run.ts` only; the Workers' config files do not change for it.
- The repository takes on a beta that changes often, and Effect, in one workspace member. A version that changes a plan unexpectedly is held back in its Dependabot pull request; if Alchemy stops being kept up, the stack moves to Terraform.
- The account gains Alchemy's state Worker, on a `workers.dev` subdomain, and a Secrets Store.
- `knip`, `biome ci` and the typecheck take in `apps/pub/infra`; whether Alchemy's peer dependencies (Vite, `ws`, `@effect/platform-node`) need to be installed there is found when it is added.
- The wildcard record and the mail records listed as missing for dek.pub are made by this program, not by hand; a deploy workflow for the Workers is still to come.
