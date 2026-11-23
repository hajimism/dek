# 109. Give the deck's page on the dev server as url in dekc goto and dekc current

Date: 2026-11-23

## Status

Accepted

## Context

An agent that needs the address of the running dev server has no field to read it from. `dekc` prints the URL once, in the banner of the process that started the server. A second `dekc` prints it inside an error message. `dekc goto --json` and `dekc current --json` reach the server and return `slug`, `slideIndex`, `beatIndex`, and `viewers`, and say nothing of where the server is. What is left is the lock, `.dek/server.json`, which is dek's own file and may hold the `--remote` password.

[Agent Usability Criteria](../docs/guide/agent-criteria.md) 5 asks that an agent never parse prose to decide what to do. An agent that did not start the server, or lost the banner, parses an error or reads a file it has no business in.

With `viewers` at 0, both commands say on stderr that "the next page opened on the dev server" lands on the slide, and do not say which page that is.

## Decision

**`dekc goto --json` and `dekc current --json` return `url`: the deck's page on the dev server that answered.**

- It is the page a browser opens to show that deck: the server's root when the server was started for that deck alone, and `/decks/<deck>/` under it when the server serves the project.
- It is the address on this machine, `http://127.0.0.1:<port>/…`, as the lock names it. With `--remote` it is still that address, and never holds the password, a token, or a pairing code.
- The note on stderr for `viewers` 0 names it: "the next page opened at <url> shows <slug>".
- The text output is unchanged: the slug, and the beat when it is not the first.

**Rejected:**

- **A command that prints the lock.** It would be a second place to learn the position of the server apart from the two commands that already talk to it, and it would answer for a server that is gone until something asks that server a question. `current` asks one.
- **The LAN addresses of a `--remote` server.** The process that started it prints them beside the password; the lock keeps neither the addresses nor a reason for another process to hand them out.
- **`url` only on `current`.** `goto` and `current` share one result, and an agent that just moved the deck opens the page next.

## Consequences

An agent gets the page to open, or to hand to a screenshot tool, from the command that tells it where the deck is. It no longer reads `.dek/server.json`.

`url` is a new required property of both results. `docs/public/cli.schema.json` carries it, and by [ADR 31](0031-fail-a-pull-request-that-narrows-json-without-a-commit-marked-breaking.md) a property added is not a breaking change.

A caller that compared the stderr note to the old sentence sees a different one.
