# 71. Keep only a dek.pub deck's current version, and show a deck to its team alone until its visibility reaches its guests

Date: 2026-11-14

## Status

Accepted

Supersedes [55. Let the team's side of a dek.pub deck read its drafts, and promote one with dekc](0055-let-the-team-s-side-of-a-dek-pub-deck-read-its-drafts-and-promote-one-with-dekc.md)

Amended by [81. Open a dek.pub link talk only with the key its URL carries](0081-open-a-dek-pub-link-talk-only-with-the-key-its-url-carries.md)

## Context

ADR 55 let the team's side read a version before it is current: `dekc pub publish --no-promote` uploads a draft, the team reads it and comments on it, and `dekc pub promote` or the manage page makes it the one the guests read. ADR 64 renamed the client's side to the guests. So a deck holds every version it was ever sent, the talk page has a version picker for the team, threads carry a version clause beside their scope, and `dekc pub status` lists the versions.

What a draft is for is a deck the team prepares before the guests see it. That is the deck-level form of a project on dek.pub, which is planned: a project holds the team and the guests, a deck is made inside it, the team sees it first, and turning it on shows it to the guests. For that, a deck needs a step of visibility that the team reaches and the guests do not. It does not need versions: once the guests can read a deck, each publish may reach them at once. The author's source, and with it every earlier state of the talk, is in their own repository, so a version kept on dek.pub is not the way back.

Holding every version costs more than it gives. Nothing deletes a version, so R2 only grows; the version picker, `?v=`, the version clause of `canSeeThread`, `GET comments?version=`, `promote` and the rollback dialog are each a rule to keep right; and a deck with no current version is a third state of visibility that no visibility names.

## Decision

**A deck has one version readers see, the newest.** Every `dekc pub publish` makes the version it uploads current. `--no-promote`, `dekc pub promote`, `POST /api/decks/:id/promote` and `PromoteRequest` go. The talk page loses the version picker and `?v=`, and the manage page loses its list of versions and the rollback dialog; its section about versions shows the current one only: its number, when it was published, its message and the slides it changed.

**Versions are still numbered, inside.** `n` climbs with every publish and is never reused, so the serve Worker's `/v/<n>/` and the pictures' `/i/<deck>/<n>/` stay safe to cache (ADR 43); threads keep the `n` they were opened on and renames keep theirs (ADR 49), so a thread is still placed on a later version. A publish is made on a version, its `base`, and is refused with 409 `stale_base` unless that is the current one. `latestVersion` becomes a counter: a publish takes the next number from it before its files are up, and the number is never given back, so a publish cut short skips a number instead of holding the deck. The version is recorded in one batch, its row, its renames and the deck's `currentVersion`, only while the current version is still `base`; when another publish has recorded since, nothing of it is recorded, its files are deleted, and it gets 409 `stale_base`. `DeckStatus` keeps `current` and loses `latest` and `versions`.

**A publish deletes the versions before it.** The slides a version changed are worked out against its `base` before it is recorded. Once it is, every version below it is deleted after the answer: their files in R2 (`decks/<id>/v/<m>/` for each `m` below the new `n`, those a publish cut short left included) and their rows in `versions`. Nothing above the new `n` is touched, since another publish may be writing it, and the renames stay. A cleanup that fails does not fail the publish; the next one sweeps again. A page still open on the old version gets 404 for its frame and pictures, and 409 `stale_version` when it sends a comment, which tells it to reload. `GET /api/decks/:id/comments` loses `?version=`; comments are those of the current version.

**Every side reads the current version only.** `mayReadVersion` becomes `n === currentVersion` for anyone who may see the deck; `shownVersion` goes. `canSeeThread` loses its version clause and keeps its scope clause, which ADR 51 kept apart for this. Mail follows `canSeeThread` as before (ADR 54).

**A new visibility, `team`, comes below `private`.** The four, from narrowest:

| Visibility | Who can open it | en | ja |
|---|---|---|---|
| `team` | the owner and the team's side | Team only | チームのみ |
| `private` | the owner, the team and the guests | Team and guests | チームとゲスト |
| `link` | anyone with the link | Link only | リンクを知っている人のみ |
| `public` | anyone, listed and indexed | Public | 公開 |

`canView` is the one place a side decides whether a deck opens: a `team` deck is a 404 to a guest, as to anyone else it is not shared with. Sides decide nothing else about viewing, since `link` and `public` are open to everyone. A new deck, from `POST /api/decks`, is `team`: the first publish reaches the team alone, and the owner widens it to show the guests. `dekc pub share --visibility team` and the manage page's visibility control take the new value; only `public` asks to be confirmed, as before. The owner's profile lists a `team` deck with its badge (ADR 62); nobody else sees it there.

**`team` is the switch.** The step from `team` to `private` is what "show it to the guests" means. When projects come, the grants move from the deck to the project and the four visibilities keep their meaning.

**What was not chosen:**

- **A boolean, shown to guests or not, beside the visibility.** A guest is never refused a `link` or `public` deck, so half its states would mean nothing and the code would have to rule them out. One ordered visibility has no such states, and fits the control, the `--visibility` flag, the badges and the About page's table as they are.
- **Two versions, the one the guests read and the one the team reads.** It keeps a guest from seeing a change before the team has; that was not wanted, and it keeps most of what this decision takes away.
- **Keeping old versions to roll back to.** The way back is to publish the earlier source again from the author's repository.

## Consequences

- `--json` narrows: `promote` and `--no-promote` go, and `DeckStatus` loses `latest` and `versions`. The change is marked breaking (ADR 31). `Visibility` widens with `team`.
- A deck made before this keeps `private`; nothing moves it to `team`. No dek.pub has run for real, so no deck is left with a version that is not current.
- R2 holds one version for each deck, once a publish's cleanup has run.
- Comments cannot be read where they sat on an older version; nothing could before, since `?version=` was used by neither the CLI nor the pages.
- An embed of `/v/<n>/` still breaks on each publish; a stable path for the current version is a change of its own.
- The About page's visibility table, the docs of `dekc pub` and the CLI reference change in both languages in the same change (ADR 66).
