# 110. Run one dev server for each deck, each holding a lock of its own

Date: 2026-11-23

## Status

Accepted

Amends [26. Check scanners and server state over generated inputs, with fast-check](0026-check-scanners-and-server-state-over-generated-inputs-with-fast-check.md)

Amends [28. Let a project's code run only as a page, a ref's only in an offline sandbox, and the dev server act only for its own pages](0028-let-a-project-s-code-run-only-as-a-page-a-ref-s-only-in-an-offline-sandbox-and-the-dev-server-act-only-for-its-own-pages.md)

## Context

A project runs one dev server at a time. No record decided that. The first dev server wrote `.dek/server.json` so that `dekc goto` could find it, and one file made one server.

A second `dekc` for a deck that is served is refused with `open <url>`, whatever it asked for. Started with `--visual`, `--remote`, or `--port` against a server that has none of them, it is sent to a page that is not measured, not on the LAN, and not on that port. `dekc rehearse` is sent to the deck's plain page.

A server started with a deck, or inside a deck's folder, serves that deck alone, at `/`. A second `dekc` for another deck is refused whatever port it names, and told to stop the first server, by pid, and start one at the project root. An agent that follows the hint stops a server a person, or another agent, is using, and the deck it wanted moves from `/` to `/decks/<deck>/`. The launch configs of this repository list the three sample decks on three ports; they have never run together.

What one deck cannot have is two servers:

- A server keeps the position of each deck it serves in memory (`src/server/rooms.ts`). Two servers for a deck give `dekc current` two answers, and a paired phone follows one of them.
- Each server syncs the deck on every save, so each save would write the deck's skeletons twice.

Neither holds between two decks. A server started for a deck syncs that deck's folder alone, and the files it refreshes for the project are written only when they differ.

The port is no reason either: without `--port` the OS picks a free one.

## Decision

**A deck has one dev server at a time: the one started for it, or the one started for the project. Servers for different decks run side by side.**

- A server started for a deck serves it alone, as [ADR 28](0028-let-a-project-s-code-run-only-as-a-page-a-ref-s-only-in-an-offline-sandbox-and-the-dev-server-act-only-for-its-own-pages.md) has it. A server started at the project root serves every deck, so it starts only while no other server of the project runs, and no server for a deck starts while it runs. It reads which decks have a server from the files in `.dek/servers/`, not from the decks the project lists: a deck whose script does not parse is not listed, and a server may be serving it until it parses again.
- **Each server holds a lock of its own.** The server for the project keeps `.dek/server.json`, as before. A server for one deck keeps `.dek/servers/<deck>.json`, named for its deck; a `deck` written inside it is not read. Both hold `url`, `pid`, and with `--remote` the `password`, mode 0600.
- **`.dek/servers/` ignores itself.** dek writes a `.gitignore` holding `*` into it, and replaces one found there that is anything else: an empty one ignores nothing, and git reads none that is a link. A project made before this decision ignores `.dek/server.json` by name and nothing under `.dek/servers/`, only `dekc sync` adds a line to a `.gitignore`, and the lock may hold a password.
- **A lock is taken by making its file only where none is.** The finished file is linked to its name, so of two servers that race for a free name, one gets the lock and the other is refused. On a disk with no hard links the file is opened so that it exists only if none did. A reader may catch it half written and replace it as a lock that does not read, so the writer reads the file back and gives way when it is no longer what it wrote.
- **A lock left behind is replaced by one start at a time.** Removing an old lock is where two starts could undo each other: each judges it gone, the first replaces it, and the second removes the first's. A start removes a lock only while it holds `<lock>.taking`, made the same way, and judges the lock again once it does. A start that finds the file there waits a fifth of a second for it to go, then says the file is in its way. A start that dies holding it leaves it, and dek removes none: the next start that has a lock to replace there names the file to remove.
- **A server for the project and one for a deck look once more.** They keep different files, so two that start at once each pass the check. Each looks again after taking its lock and gives way to a server it then sees. Both may give way; never both stay.
- **A lock whose port refuses a connection is dropped before a start.** A lock is live while its pid is. A server killed outright leaves its lock, and once another process of this user has that pid the lock reads as live for good. A server listens before it takes its lock and gives the lock up before it stops listening, so before it starts, a server asks the port of each lock that would refuse it. A refused connection removes the lock. A connection that opens, or neither opens nor fails within a second, leaves it: a server too busy to answer still holds its deck. `dekc goto` and `dekc current` remove nothing; a refused connection there says no dev server serves the deck.
- **A lock an older dek wrote still counts.** A dek older than this keeps every server's lock in `.dek/server.json`, with `deck` in it for a server started for one deck. That lock holds that deck, and holds the project against a server for all of it.
- **`dekc goto` and `dekc current` ask the server started for the deck, else the one for the project.** A deck's lock where nothing listens, or where what listens knows no such deck, is passed over for the project's server. When what listens there knows no such deck and no other server answers, they name that lock as the file to remove: a start reads it as a live server's, so `dekc <deck>` would be refused. With neither, they say `no dev server serves deck "<deck>"`, and the hint is `dekc <deck>`, which starts one beside whatever else runs.
- **What a refused start is told.** For a deck already served: the running server's URL, with `open <url>`, or `open <url>decks/<deck>/` when the server for the project serves it. `dekc rehearse` is sent to the deck in rehearsal there, `?rehearse`, which any server for the deck serves. When the start asked for `--visual`, `--remote`, or a port and the running server lacks it, the hint says which, and that the page is there as it is, or the server can be stopped, by pid, and the command run again: a server takes all three as it starts. A lock records `visual` for this; a password in it says `--remote`, and the port is in its URL. For the project while servers for single decks run: which decks they serve, that `dekc` inside another deck's folder serves that deck beside them, and that stopping them, by pid, and running the same command again serves every deck from one, which alone gives the `--visual`, `--remote`, or port it asked for. Where every deck has its server there is none to add, and the hint sends to the decks where they are served.

**Rejected:**

- **Any number of servers, each on the next port.** It is what a bundler's dev server does, and such a server only reads. dek's keeps the deck's position and writes its skeletons, so a second one for a deck is a second answer, not a spare.
- **Always serve the project, and have a second `dekc` join the running server.** It goes against ADR 28, where a server started for one deck serves no other. It moves a deck's page from `/` to `/decks/<deck>/`, and it cannot give a second `dekc --port N` its port.
- **A second `dekc` for a served deck that succeeds, or stays attached.** The server belongs to the process that started it and stops when that process's parent goes away. A caller told it has a server would lose it without a word.
- **One file that lists every server.** Each start and stop would read the file, change it, and write it back, and two servers that start together would lose one entry.
- **Every lock under `.dek/servers/`, the project's too.** A server an older dek started holds `.dek/server.json`; a dek that no longer read that file would start beside it.
- **Asking the running server who it is.** No route says so, and one that did would be one more thing a `--remote` server tells the room ([ADR 28](0028-let-a-project-s-code-run-only-as-a-page-a-ref-s-only-in-an-offline-sandbox-and-the-dev-server-act-only-for-its-own-pages.md) lists what the audience gets). A port that listens is taken for the server; another program on the same port under the same reused pid is the case left. `dekc goto` and `dekc current` can tell that case for a deck's own lock, because what answers there has no such deck, and say so.
- **A new line in the project's `.gitignore`.** Only `dekc sync` writes that file, so a `--remote` password could be committed before anyone ran it.

## Consequences

One launch entry, terminal, or agent per deck works: `dekc <deck> --port N` for each. Nothing is stopped to open a second deck.

`dekc` at the project root and `dekc` for a deck still exclude each other, and the hint for the first still names a pid to stop. It is the one case left where two wishes cannot both be met.

Each server started with `--visual` runs its own Chromium.

`.dek/marks.json` and `.dek/annotations.json` hold every deck's entries, and two servers may now write them. Each write reads the file afresh, so what can be lost is one mark or note made within the same few milliseconds as another deck's, as `dekc marks --clear` beside a running server can already lose one.

A lock says how its server was started only since this decision. A server an older dek started with `--visual` reads as started without it.

When a killed server's pid goes to another process and its port to another program, a start for that deck is refused as by a live server, and its hint names the pid in the lock, whatever process has it now, as the one to stop. The port is asked whether it listens, not whose it is. `dekc current` for the deck names the lock to remove.

A dek older than this does not read `.dek/servers/`. Started while a newer dek serves a deck from there, it starts a second server for that deck. Both deks running in one project at once is the case; upgrading with no server running avoids it.

Something that read `.dek/server.json` to find a server started for one deck no longer finds it there. `url` in `dekc current --json` ([ADR 109](0109-give-the-deck-s-page-on-the-dev-server-as-url-in-dekc-goto-and-dekc-current.md)) is the way to ask.

ADR 28 says the password is kept in `.dek/server.json`; it is kept in the server's lock, which for a server started for one deck is `.dek/servers/<deck>.json`. ADR 26 says a project refuses a server exactly while a live one holds it; the model in `tests/server/lock.test.ts` now says a deck refuses a server exactly while a live one serves it, its own or the project's.
