# 93. Give dek.pub's Alchemy tokens Workers Scripts and Secrets Store edit, since reading the state store binds a secret to a preview Worker

Date: 2026-11-15

## Status

Accepted

## Context

ADR 70 runs Alchemy in `infra.yml` with two account-owned tokens: `CLOUDFLARE_PLAN_TOKEN`, meant to only read, for the plan on a pull request and the weekly drift check, and `CLOUDFLARE_DEPLOY_TOKEN`, in the `cloudflare-prod` environment, for the deploy. It left two questions for the first run against the account: which permission groups the tokens need, and whether a plan works with a token that only reads.

The first deploy on 2026-11-15 answered both. The tokens were first made with, on the whole account, Workers Metadata Read-Only and Secrets Store Read, and, on the `dek.pub` and `dekusercontent.com` zones, Zone Read, Zone Settings and DNS (Read for the plan, Edit for the deploy). Every run failed before reading any resource, at "Refreshing Cloudflare State Store credentials".

Alchemy 2.0.0-beta.85 reaches the state store (`Cloudflare.state()`) with a token kept in the account's Secrets Store. To read it, Alchemy:

1. opens an edge-preview session (`GET /accounts/{id}/workers/subdomain/edge-preview`);
2. uploads a short-lived preview Worker that binds that secret;
3. calls the Worker once.

This happens on every command that loads state: plan and drift as well as deploy.

The cause was found by running each of these calls with the deploy token on a local machine, printing only status codes and Cloudflare's errors:

- Without Workers Scripts edit, the preview upload failed.
- With it, the session was created (200), and the upload was refused with "Secrets store binding authorization failed".

Cloudflare's Secrets Store access control states that binding a secret to a Worker takes Account Secrets Store Edit; Read is not enough. The secret's scopes must also include `workers`, which the state store's do. With Secrets Store Edit added, the deploy ran and created the stack. Reports of code 10000 on the same edge-preview endpoint with account-owned tokens are open at Cloudflare (developer-platform#106 and #117); with the permissions below, it worked with an account-owned token here.

## Decision

**Both tokens hold, on the whole account:**

- **Workers Scripts: Edit** (the legacy group);
- **Secrets Store: Edit**;
- Workers Metadata Read-Only and Account Settings Read.

On the two zones, the plan token reads Zone, Zone Settings and DNS. The deploy token reads Zone and edits Zone Settings and DNS.

**There is no read-only plan token.** Any command that reads Alchemy's state uploads a preview Worker that binds a secret, so the plan and drift jobs carry write permissions on the account's Workers and Secrets Store. The deploy token stays apart because it alone edits the zones, and because it sits behind the `cloudflare-prod` approval. The plan job still runs only for pull requests from this repository, never a fork's.

Workers Metadata Read-Only and Account Settings Read were added while searching for the cause. Whether they are needed was not tested apart, so they stay until a run shows they are not.

## Consequences

- A pull request from this repository that touches `apps/pub/infra` runs code with a token that can upload Workers and bind secrets. Whoever can push a branch here can already deploy, so this widens nothing for them.
- If Alchemy later reads the state store some other way, or Cloudflare lets a preview Worker bind a secret with Read, the plan token goes back to reading only, and this record is superseded.
- Staging gets tokens of its own, made with the same groups on its own zone.
