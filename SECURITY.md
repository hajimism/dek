# Security policy

## Supported versions

dek is 0.x. Only the latest release on npm, [`@hajimism/dek`](https://www.npmjs.com/package/@hajimism/dek), receives fixes.

## Reporting a vulnerability

Report it privately through GitHub: [open a draft security advisory](https://github.com/hajimism/dek/security/advisories/new). Please do not open a public issue.

Include the dek version (`dekc --version`), the Bun version, and the steps that reproduce it. You can expect a first reply within a week. Once a fix is released, the advisory is published with credit to you unless you ask otherwise.

## Scope

dek reads and writes files inside a project, serves decks over HTTP on your machine or LAN (`dekc --remote`), and fetches other decks from GitHub (`dekc ref`). Reports about any of these are in scope: reading or writing outside the project, reaching the dev server or presenter notes without the password, or code running from a fetched deck.

A project's own files are in scope too, when `dekc` is started as its bin (`dekc`, `bunx dekc`, or the `node_modules/.bin/dekc` that installing dek wrote): a `.env`, `bunfig.toml`, `tsconfig.json`, or any other file in a project choosing a program dek runs, running code in dek's process, or choosing where a token goes. Out of scope is a launch that skips the bin's flags, such as `bun ./node_modules/.bin/dekc`, which lets Bun read the project's `bunfig.toml` before dek starts, and code a project supplies to be run, such as its `package.json` scripts or a `node_modules` it commits.
