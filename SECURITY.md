# Security policy

## Supported versions

dek is 0.x. Only the latest release on npm, [`@hajimism/dek`](https://www.npmjs.com/package/@hajimism/dek), receives fixes.

## Reporting a vulnerability

Report it privately through GitHub: [open a draft security advisory](https://github.com/hajimism/dek/security/advisories/new). Please do not open a public issue.

Include the dek version (`dekc --version`), the Bun version, and the steps that reproduce it. You can expect a first reply within a week. Once a fix is released, the advisory is published with credit to you unless you ask otherwise.

## Scope

dek reads and writes files inside a project, serves decks over HTTP on your machine or LAN (`dekc --remote`), and fetches other decks from GitHub (`dekc ref`). Reports about any of these are in scope: reading or writing outside the project, reaching the dev server or presenter notes without the password, or code running from a fetched deck.
