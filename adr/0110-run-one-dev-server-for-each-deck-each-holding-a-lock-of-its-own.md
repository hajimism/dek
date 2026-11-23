# 110. Run one dev server for each deck, each holding a lock of its own

Date: 2026-11-23

## Status

Accepted

Amends [26. Check scanners and server state over generated inputs, with fast-check](0026-check-scanners-and-server-state-over-generated-inputs-with-fast-check.md)

Amends [28. Let a project's code run only as a page, a ref's only in an offline sandbox, and the dev server act only for its own pages](0028-let-a-project-s-code-run-only-as-a-page-a-ref-s-only-in-an-offline-sandbox-and-the-dev-server-act-only-for-its-own-pages.md)

## Context

A project runs one dev server at a time. No record decided that. The first dev server wrote `.dek/server.json` so that `dekc goto` could find it, and one file made one server.

A server started with a deck, or inside a deck's folder, serves that deck alone, at `/`. A second `dekc` for another deck is refused whatever port it names, and told to stop the first server, by pid, and start one at the project root. An agent that follows the hint stops a server a person, or another agent, is using, and the deck it wanted moves from `/` to `/decks/<deck>/`. The launch configs of this repository list the three sample decks on three ports; they have never run together.

What one deck cannot have is two servers:

- A server keeps the position of each deck it serves in memory (`src/server/rooms.ts`). Two servers for a deck give `dekc current` two answers, and a paired phone follows one of them.
- Each server syncs the deck on every save, so each save would write the deck's skeletons twice.

Neither holds between two decks. A server started for a deck syncs that deck's folder alone, and the files it refreshes for the project are written only when they differ.

The port is no reason either: without `--port` the OS picks a free one.

## Decision

**A deck has one dev server at a time: the one started for it, or the one started for the project. Servers for different decks run side by side.**

- A server started for a deck serves it alone, as [ADR 28](0028-let-a-project-s-code-run-only-as-a-page-a-ref-s-only-in-an-offline-sandbox-and-the-dev-server-act-only-for-its-own-pages.md) has it. A server started at the project root serves every deck, so it starts only while no other server of the project runs, and no server for a deck starts while it runs.
- **Each server holds a lock of its own.** The server for the project keeps `.dek/server.json`, as before. A server for one deck keeps `.dek/servers/<deck>.json`, named for its deck; a `deck` written inside it is not read. Both hold `url`, `pid`, and with `--remote` the `password`, mode 0600.
- **`.dek/servers/` ignores itself.** dek writes a `.gitignore` holding `*` into it. A project made before this decision ignores `.dek/server.json` by name and nothing under `.dek/servers/`, only `dekc sync` adds a line to a `.gitignore`, and the lock may hold a password.
- **A lock is taken by making its file only where none is.** The finished file is linked to its name, so of two servers that race for one deck, one gets the lock and the other is refused. A lock whose server is gone is removed first. A server for the project and one for a deck keep different files, so each looks once more after taking its lock, and gives way to a server it then sees.
- **A lock an older dek wrote still counts.** A dek older than this keeps every server's lock in `.dek/server.json`, with `deck` in it for a server started for one deck. That lock holds that deck, and holds the project against a server for all of it.
- **`dekc goto` and `dekc current` ask the server started for the deck, else the one for the project.** With neither, they say `no dev server serves deck "<deck>"`, and the hint is `dekc <deck>`, which starts one beside whatever else runs.
- **What a refused start is told.** For a deck already served: the running server's URL, with `open <url>`, or `open <url>decks/<deck>/` when the server for the project serves it. For the project while servers for single decks run: which decks they serve, that `dekc` inside another deck's folder serves that deck beside them, and that stopping them, by pid, and running `dekc` at the root serves every deck from one.

**Rejected:**

- **Any number of servers, each on the next port.** It is what a bundler's dev server does, and such a server only reads. dek's keeps the deck's position and writes its skeletons, so a second one for a deck is a second answer, not a spare.
- **Always serve the project, and have a second `dekc` join the running server.** It goes against ADR 28, where a server started for one deck serves no other. It moves a deck's page from `/` to `/decks/<deck>/`, and it cannot give a second `dekc --port N` its port.
- **A second `dekc` for a served deck that succeeds, or stays attached.** The server belongs to the process that started it and stops when that process's parent goes away. A caller told it has a server would lose it without a word.
- **One file that lists every server.** Each start and stop would read the file, change it, and write it back, and two servers that start together would lose one entry.
- **Every lock under `.dek/servers/`, the project's too.** A server an older dek started holds `.dek/server.json`; a dek that no longer read that file would start beside it.
- **A new line in the project's `.gitignore`.** Only `dekc sync` writes that file, so a `--remote` password could be committed before anyone ran it.

## Consequences

One launch entry, terminal, or agent per deck works: `dekc <deck> --port N` for each. Nothing is stopped to open a second deck.

`dekc` at the project root and `dekc` for a deck still exclude each other, and the hint for the first still names a pid to stop. It is the one case left where two wishes cannot both be met.

Each server started with `--visual` runs its own Chromium.

`.dek/marks.json` and `.dek/annotations.json` hold every deck's entries, and two servers may now write them. Each write reads the file afresh, so what can be lost is one mark or note made within the same few milliseconds as another deck's, as `dekc marks --clear` beside a running server can already lose one.

A dek older than this does not read `.dek/servers/`. Started while a newer dek serves a deck from there, it starts a second server for that deck. Both deks running in one project at once is the case; upgrading with no server running avoids it.

Something that read `.dek/server.json` to find a server started for one deck no longer finds it there. `url` in `dekc current --json` ([ADR 109](0109-give-the-deck-s-page-on-the-dev-server-as-url-in-dekc-goto-and-dekc-current.md)) is the way to ask.

ADR 28 says the password is kept in `.dek/server.json`; it is kept in the server's lock, which for a server started for one deck is `.dek/servers/<deck>.json`. ADR 26 says a project refuses a server exactly while a live one holds it; the model in `tests/server/lock.test.ts` now says a deck refuses a server exactly while a live one serves it, its own or the project's.
