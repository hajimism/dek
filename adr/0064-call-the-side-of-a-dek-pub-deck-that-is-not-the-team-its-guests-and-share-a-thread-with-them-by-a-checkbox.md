# 64. Call the side of a dek.pub deck that is not the team its guests, and share a thread with them by a checkbox

Date: 2026-11-14

## Status

Accepted

Amends [51. Give each dek.pub grant a side and each thread a scope](0051-give-each-dek-pub-grant-a-side-and-each-thread-a-scope.md)

Amends [55. Let the team's side of a dek.pub deck read its drafts, and promote one with dekc](0055-let-the-team-s-side-of-a-dek-pub-deck-read-its-drafts-and-promote-one-with-dekc.md)

## Context

ADR 51 gave each grant a side, `team` or `client`, and ADR 55 let the team's side read drafts while the client's side reads the current version. The word reached every layer: the manage page's side picker ("Client" / クライアント), the composer, the card's button ("Show to client"), the talk page's draft notice, the protocol's `GrantSide`, the `grants.side` column and its default, the guide and the CLI reference. The product owner says the word is wrong for the people a team shares a deck with, and that the word is guest (ゲスト).

A word that changes in the pages but not in the API, the store or the docs leaves two words for one thing, and agents read the API, `--json` and the docs as much as people read the pages.

The word guest is free. ADR 61 dropped the signed-out "guest" commenters, the `--comments guests` policy and Turnstile, so nothing in the code means a signed-out writer any more. The one echo left is `dekc pub share --comments guests`, which is refused as a value the flag does not take, and its tests now name it as the old policy. ADR 47, 51 and 56 use guests in that old sense; they are left as they are.

The composer asked the team's side to pick a scope for each new thread from a segmented control, "Team only" / "Client too", with "Team only" picked. The two segments looked like two equal choices, though one is the default and the other the exception. Sharing is also the one way a scope changes: a team thread can be shared later, and a shared one is never taken back (ADR 51).

Released dek.pub and dekc speak protocol version 1, where `GrantSide` is `team | client`. ADR 61 bumped the version to 2 in the same set of unreleased changes. dekc sends and reads no grant; only the manage page does. Nothing is deployed, so no stored grant has to keep its value.

## Decision

**The side of a deck that is not the team is its guests.** `GrantSide` is `team | guest`. A new grant is on the guest side unless the owner chooses the team, as it was on the client's. Anyone with no grant is on the guest side, as `sideOf` gives. `ThreadScope` keeps `team | shared`: a shared thread is one the guests read too. The words, in both languages:

| Key | English | 日本語 |
|---|---|---|
| `side.guest` | Guest | ゲスト |
| `comment.share` | Share with guests | ゲストにも公開 |
| `comment.widen` | Share with guests | ゲストにも公開 |
| `comment.widened` | Shared with guests. | ゲストにも公開しました。 |
| `comment.teamOnly` | Team only | チームのみ |
| `talk.draft` | Draft: version {n}. Guests read version {current}. | ドラフト: 版 {n}。ゲストには版 {current} が見えています。 |
| `manage.sharing.sideHint` | Team members read every thread; guests read only those shared with them. | チームの人はすべてのスレッドを、ゲストは公開されたスレッドだけを読めます。 |

The grant side's keys stay under `side.*`, beside the role's `role.*`. `comment.scope`, `comment.scope.team` and `comment.scope.shared` go.

**The rename rides in protocol version 2.** Version 2 is not released, so a dekc or a page that speaks it never saw `client`, and the version is not bumped again. The `--json` of `dekc pub comments` changes only the description of `scope`.

**The store follows.** `grants.side` holds `team` or `guest`, with `guest` as its default. The migration first moves every grant on the `client` side to `guest`, then makes the table again, since SQLite cannot change a column's default in place. Void counts the rebuild as destructive, so the file carries `-- void:allow-destructive`. No row is lost.

**The composer shares a thread by a checkbox.** On the team's side, below the text, a checkbox "Share with guests" / 「ゲストにも公開」 is unchecked. Unchecked, the thread is posted with scope `team`; checked, with `shared`. After a post it is unchecked again, so each thread starts inside the team. The guest side sees no checkbox and sends no scope, as before. A team thread's card keeps its "Team only" badge with the lock, and its button to share it later carries the checkbox's words, so both say the same thing for the same act.

**What was not chosen:**

- **Keeping `client` on the wire and in the store, and renaming only the pages.** People would read guest and agents client, for one thing.
- **Another word**, such as reviewer or viewer. Both sides write review threads, and viewer is already the `view` role.
- **Keeping the segmented control with new labels,** "Team only" / "Guests too". It still shows the exception as an equal choice beside the default.
- **A switch,** as the manage page uses. There a switch changes a setting at once; the composer's choice is sent with the post, which is what a checkbox is for.
- **Keeping the checkbox's state after a post.** A thread shared by mistake cannot be taken back, and one kept to the team by mistake can be shared from its card.
- **Bumping the protocol to version 3.** No released side speaks version 2, so there is no reader of `client` in it to warn.

## Consequences

- A migration moves `grants.side` from `client` to `guest`, and makes `guest` its default. A development database keeps its grants, on the guest side.
- `composer.svelte` no longer uses `SegmentedControl`. `tests/browser/composer.test.ts` checks that the checkbox starts unchecked and posts `team`, posts `shared` when checked and is unchecked again after, and is not there for the guest side. `tests/unit/deck.test.ts` and `tests/unit/comment.test.ts` check `sideOf`, `widestSide`, `scopeFor` and the version rules with `guest`. `tests/e2e/run.ts` names its second reader the guest.
- The guide, the CLI reference, dek.pub's list of what is not built yet and the code's comments say guest, in English and in Japanese. Where `client` is left, it means an HTTP or OAuth client, Better Auth's client, or browser-side code (`client.svelte.ts`).
- ADR 51 and 55 still say client; read it as guest. Their decisions stand.
