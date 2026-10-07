# 12. Take GitHub tokens and DEK_ variables only from what the user sets

Date: 2026-10-06

## Status

Accepted

## Context

dek treats a project someone else wrote as untrusted: it follows no symlink out of the project, and it never runs the working directory's `node_modules/.bin/rumdl`. Two things undid that (GHSA-mj6q-67q7-q923).

- Bun loads `.env`, `.env.local`, and the file for `NODE_ENV` from the working directory into `process.env` before dek starts. dek takes the programs it runs (`DEK_GH`, `DEK_RUMDL`, `DEK_PLAYWRIGHT`, `DEK_FFMPEG`, `DEK_VIDEO`) and the host `dekc ref` calls (`DEK_GITHUB_API`) from `process.env`, so a project could choose them by committing a `.env`.
- When `GITHUB_TOKEN` was unset, `dekc ref` ran `gh auth token` before every request, public repositories included, and sent what it printed to whatever `DEK_GITHUB_API` named. That token can write to every repository its owner can. A Bun process taking it out of `gh` is also what credential-stealing npm worms do, and Microsoft Defender for Endpoint raised an alert on a plain `dekc ref`.

## Decision

- The `dekc` bin runs Bun with `--no-env-file` (`#!/usr/bin/env -S bun --no-env-file`).
- When Bun loaded `.env` files anyway, as `bun ./node_modules/.bin/dekc` does, dek removes from `process.env` every `DEK_` variable that `.env`, `.env.local`, `.env.development`, `.env.production`, or `.env.test` names, before it reads any, and warns. `DEK_` variables come only from the environment dek starts in.
- dek never asks `gh` for a token. `dekc ref` sends the token the user set in `GITHUB_TOKEN`, else `GH_TOKEN`, and none for public repositories when neither is set. `DEK_GH` is gone.
- A token is sent only to `https://api.github.com`. `DEK_GITHUB_API` still points the calls elsewhere, without a token.

## Consequences

A project's files can no longer choose a program dek runs or where a token goes, and `dekc ref` no longer looks like credential theft to security software.

This is a breaking change:

- Reading a private ref needs `GITHUB_TOKEN` or `GH_TOKEN`; being signed in to `gh` is not enough. `GITHUB_TOKEN=$(gh auth token) dekc ref …` does what dek used to do, by the user's choice.
- A `DEK_` variable kept in a project's `.env`, such as `DEK_VOICE_URL`, stops applying; set it in the shell, or use `engine` in `voice.toml`.
- `DEK_GITHUB_API` cannot read a private repository, since no token goes to it.
