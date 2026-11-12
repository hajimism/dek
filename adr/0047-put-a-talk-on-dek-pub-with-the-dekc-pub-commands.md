# 47. Put a talk on dek.pub with the dekc pub commands

Date: 2026-11-12

## Status

Accepted

## Context

dek.pub is the service that shows a talk online: the slides, the script beside them for those it is shared with, and comments on a slide or a passage. The server and `dekc` share the shapes and paths in `src/pub/protocol.ts`. What was missing is the CLI that signs in, publishes, sets who may read and comment, and brings the comments back, for a person at a terminal and for an agent alike ([Agent Usability Criteria](../docs/guide/agent-criteria.md): every result in `--json`, no prompt, the exit code by severity).

Several things shape it:

- **Signing in needs a browser.** dek.pub signs people in with Better Auth, whose device-authorization plugin serves OAuth 2.0's device grant (RFC 8628): the CLI gets a code, a person approves it in a browser, and the CLI polls until then. An agent cannot approve the code; it can only show it to a person and wait. Its shell calls also have time limits of their own, often shorter than the minutes a person takes.
- **Who reads what.** The owner presents from the whole script; a reader of a deck whose script is shown sees only what is said aloud, as `dekc build --public` builds it; a reader of a deck whose script is not shown must get no script at all. A `--public` build still carries the spoken script in the page's data, so it cannot be that third build.
- **The CLI's grammar puts a deck before a subcommand**, as `dekc voice [deck] say`, and resolves a command's deck for all its subcommands. `login`, `logout`, and `whoami` work on no deck, and `publish` and the rest on one.
- **A first word that is no command names a deck** for the bare `dekc [deck]`, so a command named `pub` hides a deck of that name.
- **ADR 31 counts a wider enum in a printed value as breaking.** `SkippedCheck.check` is shared by lint, check, and build.
- **The flag table holds one meaning per flag.** `--public` already means build's audience build, and `--no-script` is wanted for a build with no script.

## Decision

**`dekc pub` is a namespace of subcommands**, in a new help group, Publish: `login`, `logout`, `whoami`, `publish [deck]`, `share [deck]`, `status [deck]`, `open [deck]`, `comments [deck]`, and `comments reply|resolve|reopen [deck] <id>`. `dekc pub` alone is a usage error that names them. Each takes `--server <url>`, over `DEK_PUB_SERVER`, over `https://dek.pub` (ADR 48 says what goes over the network). Every subcommand prints a strict `--json` contract, one union under `pub` in `cli.schema.json` told apart by `action`.

**A subcommand may take a deck of its own.** Under a command that takes none, a subcommand that declares `scope: "deck"` takes the deck after its words, as `dekc pub publish talk` and `dekc pub comments reply talk 3 Thanks`, or `--deck`, or the deck it runs in; the CLI resolves it, and its hints are retyped with it, as for any deck command. Of two subcommands that both fit, the longer is named, so `comments reply` is not read as `comments`.

**A deck may not be named after a command.** `dekc new` and `dekc init --deck` refuse `pub`, and any other command's name, with a hint to pick another: `dekc pub` would run the command, never the deck.

**`login` is one run in text and two with `--json`.** Text prints the URL and the code on stderr and polls in the same run. `--json` with no sign-in waiting asks for a code, keeps it beside the credentials (ADR 48), and returns at once: `{ "status": "pending", "url", "code", "expiresAt", "next": "dekc pub login --json" }`. The next `dekc pub login --json` finds the code and waits for its approval, then returns `{ "status": "signed-in", "me", "stored" }`. Polling follows the server's interval, five seconds longer after each `slow_down`; a denied or expired code is forgotten, and the error says to sign in again. On approval the device token is traded for a dek API key at `POST /api/cli/key`, and only that key is kept.

**`publish` does what sharing a talk takes, in order, and stops where a person would:**

1. Lint the deck as `dekc lint` does, rumdl and plugins included, without the rendered rules. An error stops it: `"ok": false`, `"published": false`, the diagnostics, exit 1, and nothing sent. Warnings go with the version.
2. Build the talk three times, with the core build, into the deck's `.cache/pub/`: `full`, the speaker's; `public`, the audience's; and `bare`, with no script at all. `bare` is a new reader, `nobody`: the page carries no script and no beat's heading, and has no presenter view. `dekc build --no-script` builds it too, and the protocol's version files gain `bare`.
3. The public build's slide map, whose `out` is the field name `public`, not a path on this machine.
4. A PNG of each slide as it arrives, step `0`, with the shot cache `dekc shot` uses, and the first slide at its last beat as `cover`. Without Playwright neither is sent, and `skipped` says so with an entry of its own, `check: "shots"`, beside lint's skipped checks.
5. The source: a tar of the deck's folder without `dist/`, `.cache/`, and names that start with a dot, plus `effective-config.json`, the `dek.toml` values in effect. It is written by dek's own writer, entries in byte order with the time 0, so the same source is the same sha256 on any machine; `status` compares that with the newest version's.
6. With no `pub:` in `script.md`, make the deck (`POST /api/decks`, its slug the folder's name lowercased), then write `pub:` (ADR 46) before anything is built, so the source sent holds it and a failed upload leaves the next publish on the same deck. The result says `frontmatterWritten` and lists `script.md` in `changed`, to commit.
7. Upload the version as multipart: the manifest, the files, and each picture as `shot:<slug>`. `base` is the newest version `GET /api/decks/:id` reports; the renames are those `dekc mv` recorded since that version was made. `--no-promote` sends `promote=0`. A 409 is said as another version published since this run looked, with `dekc pub status` in the hint.

**`share` takes each setting as `--<setting> <value>`:** `--visibility private|link|public`, `--script shown|hidden`, `--embed on|off`, `--comments off|signed-in|guests`. Only the settings given change, and none is a usage error. This departs from the `--private|--link|--public` switches first proposed: `--public` already means something else to `build` and `pptx`, and an enum per setting is checked by the flag table, needs no rule against two switches at once, and reads like `--comments`.

**`comments` reads like `dekc annotations`.** Each row is the protocol's `CommentRow`; each quote of the script gains where `script.md` has it now (`path`, `line`, `column`, or `null` and `found: false`), looked for in the comment's section as text, with emphasis, link addresses, and comments left out and white space folded; each element's `path` is its slide's file; `shot` is the command that shows the slide at the comment's beat. `reply`, `resolve`, and `reopen` take a comment's ID or its number.

**`open` opens the deck's URL in text mode only.** With `--json` it returns `{ "url" }` and opens nothing: an agent asked for the address, not for a window on someone's screen. It runs `BROWSER` when set, else `open` on macOS and `xdg-open` elsewhere.

**`pub` joins `lint` and `check` among the commands that can fail on what they found:** only a publish that lint stopped prints `"ok": false` with its fields; `published` tells the two publish shapes apart.

**What was not chosen:**

- **Making the bare `dekc pub` mean `status`.** A word with no subcommand is more often a typo than a request; the usage error lists what there is.
- **`login --json` that blocks until approval.** An agent would see nothing to show the person until the call ended, and a shell limit would end it first.
- **A `--wait` flag.** A second run of the same command already says "wait", and needs no flag to remember.
- **Widening `SkippedCheck.check` with `shots`.** It would widen what lint, check, and build print, which ADR 31 counts as breaking.
- **Uploading `dist/` as `dekc build` left it.** A build there may be stale, built with `--url` for another host, or missing a reader; publish builds what it sends.

## Consequences

- `dekc help` gains a Publish group, the CLI reference a Publish table in both languages, and the guide a page, Publish on dek.pub.
- `cli.schema.json` gains `pub`; nothing another command printed changes. `dekc build` gains `--no-script`, and `ScriptReader` the reader `nobody`.
- A deck already named after a command still works with `--deck`; only making one is refused.
- The server must answer the shapes the protocol names: `POST /api/decks` and `PATCH /api/decks/:id` a `DeckStatus`, the upload a `PublishResult`, a reply a `Reply`, and a resolve or reopen the `CommentRow`. An answer the CLI cannot read is an error that says to update dek.
