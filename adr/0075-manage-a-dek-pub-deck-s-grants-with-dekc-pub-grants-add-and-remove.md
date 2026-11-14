# 75. Manage a dek.pub deck's grants with dekc pub grants, add and remove

Date: 2026-11-14

## Status

Accepted

Amended by [84. Limit the invitations a dek.pub owner's grants mail to 20 in any 24 hours, counted in D1](0084-limit-the-invitations-a-dek-pub-owner-s-grants-mail-to-20-in-any-24-hours-counted-in-d1.md)

## Context

A deck is shared with people by grants: each names a handle or an email address, a role (`view` or `comment`, ADR 52) and a side (`team` or `guest`, ADR 51 and 64). Only the manage page makes them. `src/pub/protocol.ts` already has their paths and shapes, and the API takes an API key as it does for `publish`, but `dekc pub` has no command for them. An agent that publishes a deck and sets who may open it with `dekc pub share` must then send a person to a web page to say who it is shared with.

The API has three routes. `GET grants` lists them. `POST grants` makes a grant, or changes the one the deck already has for that person, and mails only a new one. `DELETE grants/<id>` removes one, and answers the same for an ID the deck does not have. The POST takes `side` as optional, keeping the side of a grant already made, but it requires `role`. So a change of side alone would have to repeat the role, and get it wrong if the caller does not know it.

## Decision

**Three subcommands, after `comments` and `comments reply`:**

| Command | `--json` |
|---|---|
| `dekc pub grants [deck]` | `{ action: "grants", grants: Grant[] }`, oldest first, as the manage page lists them |
| `dekc pub grants add [deck] <who> [--role view\|comment] [--side team\|guest]` | `{ action: "grant", grant, invited }` |
| `dekc pub grants remove [deck] <who>` | `{ action: "revoke", grant }`, the grant removed |

`who` is a handle, with or without `@`, or an email address, as the manage page takes it. `remove` also takes a grant's ID.

**`grants add` sends only the flags given.** `NewGrant.role` becomes optional, as `side` is: a new grant is `view` on the guests' side unless the request says otherwise, and a grant already made keeps what the request leaves out. The manage page always sends both, so it works as before. The CLI lists the grants before it sends the POST. `invited` is `true` when the answer's ID was not among them, which is when dek.pub mails an invitation.

**`grants remove` finds the grant before it removes anything.** It lists the grants and matches `who` against each grant's ID and its `who`, without `@` and ignoring case. A `who` the deck is not shared with is refused with nothing sent, and the hint names `dekc pub grants`: the DELETE would answer `removed: true` for any ID. A grant by address that an account has claimed (ADR 73) is listed, and so removed, by its handle; the hint says so.

**`--role` and `--side` are flags of their own, with the values the protocol has,** and a value they do not know is refused before anything is sent. `GrantList` and `GrantRemoved` join `src/pub/protocol.ts` as the shapes of the answers the CLI reads. Only the deck's owner may run any of the three, as only they may open the manage page.

**What was not chosen:**

- **`dekc pub grant <who>` and `dekc pub revoke <who>`, with the list in `status`.** `status` prints the deck's settings and versions, and a list of people would grow it for every caller. The noun and its verbs keep the three together, as `comments` does.
- **Grants as flags of `dekc pub share`.** `share` changes settings of the deck. A grant is a record of its own, made, changed and removed one person at a time, and only a new one is mailed.
- **Defaulting `--role` in the CLI.** A change of side alone would then turn a commenter into a viewer.

## Consequences

- `--json` widens with three actions; nothing it printed before changes. `docs/public/cli.schema.json` and `llms.txt` are regenerated.
- A request with no `role` is one an older server refuses with 422. No dek.pub has run for real, so `PROTOCOL_VERSION` stays at 2.
- The tests run the commands against the fake server, which keeps grants as dek.pub does, and the e2e run adds, lists and removes a grant with `dekc` against `vp dev`.
- The guide's section on sharing and the CLI reference name the commands, in both languages.
