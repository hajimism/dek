# 12. Take GitHub tokens and DEK_ variables only from what the user sets

Date: 2026-10-06

## Status

Accepted

## Context

dek treats a project someone else wrote as untrusted: it follows no symlink out of the project, and it never runs the working directory's `node_modules/.bin/rumdl`. Two things undid that (GHSA-mj6q-67q7-q923).

- Bun loads `.env`, `.env.local`, and the file for `NODE_ENV` from the working directory into `process.env` before dek starts. dek takes the programs it runs (`DEK_GH`, `DEK_RUMDL`, `DEK_PLAYWRIGHT`, `DEK_FFMPEG`, `DEK_VIDEO`) and the host `dekc ref` calls (`DEK_GITHUB_API`) from `process.env`, so a project could choose them by committing a `.env`.
- When `GITHUB_TOKEN` was unset, `dekc ref` ran `gh auth token` before every request, public repositories included, and sent what it printed to whatever `DEK_GITHUB_API` named. That token can write to every repository its owner can. A Bun process taking it out of `gh` is also what credential-stealing npm worms do, and Microsoft Defender for Endpoint raised an alert on a plain `dekc ref`.

Checking the fix turned up three more ways a project's files configured the Bun that runs dek, none of them stopped by `--no-env-file`:

- A `bunfig.toml` in the working directory with `preload` runs that code before dek's first line, through `bunx dekc` and `./node_modules/.bin/dekc` alike. The bun processes dek starts, for the Playwright and video workers and for slide script evaluation, run in the project's directory, read its `.env` and `bunfig.toml` again, and do not inherit the parent's flags.
- For dek installed in a project's `node_modules`, the `tsconfig.json` nearest dek's files was the project's, since the package shipped none. Its `paths` could map `zod` to a file the project committed, and `dekc --version` ran it.
- Bun also loads `.env.development.local`, `.env.production.local`, and `.env.test.local`. Besides DEK_ variables, a `.env` reaches Bun's own: `HTTPS_PROXY` takes effect before dek starts and cannot be undone from inside it, and `NODE_TLS_REJECT_UNAUTHORIZED=0` turns off certificate checks, so together they could read a token. Bun reads `NODE_TLS_REJECT_UNAUTHORIZED` on each request, so deleting it restores the checks; `NODE_EXTRA_CA_CERTS` from a `.env` has no effect.

The reporter also pointed at two ways a ref, someone else's deck pinned in `dek.toml`, reached further than reading:

- `dekc ref` wrote the ref's title into the References list of dek's block in `AGENTS.md` as it was. YAML lets a title hold line breaks, so a title could add a heading and instructions to the block agents read as dek's own guidance.
- `dekc shot <ref>` runs the ref's slide scripts in Chromium, and Playwright leaves Chromium's sandbox off by default. Nothing kept those scripts off the network.

## Decision

- The `dekc` bin runs Bun with `--no-env-file --config=/dev/null` (`#!/usr/bin/env -S bun --no-env-file --config=/dev/null`), and every bun dek starts gets `--no-install --no-env-file --config=/dev/null` (`BUN_FLAGS` in `src/core/spawn.ts`).
- The package ships its `tsconfig.json`, so it is the one nearest dek's files wherever dek is installed. `scripts/check-package.sh` tries a project's `paths` against the packed tarball.
- When Bun loaded `.env` files anyway, as `bun ./node_modules/.bin/dekc` does, dek removes from `process.env` every `DEK_` variable, and `NODE_TLS_REJECT_UNAUTHORIZED`, that `.env`, `.env.local`, or a `.env.<mode>` or `.env.<mode>.local` file for `development`, `production`, or `test` names, before it reads any, and warns. `DEK_` variables come only from the environment dek starts in.
- A ref's title goes into `AGENTS.md` as one line: line breaks and control characters become one space, and it is cut to 80 characters.
- The Playwright worker launches Chromium with `chromiumSandbox: true`, and without it only when that launch fails, as in a container running as root. Every page it draws, and the video worker's, runs with `offline: true`; a deck is self-contained (`DEK020`), so a slide needs no network.
- dek does not warn about a `bunfig.toml` on that launch: its preload has already run by then and could silence the warning. SECURITY.md puts such a launch out of scope instead.
- dek never asks `gh` for a token. `dekc ref` sends the token the user set in `GITHUB_TOKEN`, else `GH_TOKEN`, and none for public repositories when neither is set. `DEK_GH` is gone.
- A token is sent only to `https://api.github.com`. `DEK_GITHUB_API` still points the calls elsewhere, without a token.

## Consequences

A project's files can no longer choose a program dek runs or where a token goes, and `dekc ref` no longer looks like credential theft to security software.

This is a breaking change:

- Reading a private ref needs `GITHUB_TOKEN` or `GH_TOKEN`; being signed in to `gh` is not enough. `GITHUB_TOKEN=$(gh auth token) dekc ref …` does what dek used to do, by the user's choice.
- A `DEK_` variable kept in a project's `.env`, such as `DEK_VOICE_URL`, stops applying; set it in the shell, or use `engine` in `voice.toml`.
- `DEK_GITHUB_API` cannot read a private repository, since no token goes to it.
- A project's `bunfig.toml` no longer applies to `dekc`.
- A slide that loads something remote, which `DEK020` already reports, draws without it in `shot`, `lint --visual`, `pdf`, `pptx`, and `video`.

What stays open, and is written down as out of scope in SECURITY.md and the architecture guide:

- A launch that skips the shebang, such as `bun ./node_modules/.bin/dekc`, still lets Bun read the project's `bunfig.toml` and its `HTTPS_PROXY`.
- `env -S` is missing from BusyBox `env`, and how Bun's Windows shim treats the shebang's flags is unchecked; `/dev/null` does not exist on Windows.
- A project's `package.json` scripts, and anything it commits under `node_modules`, including a `node_modules/.bin/dekc` that `bunx dekc` would pick, are the project's own code.
