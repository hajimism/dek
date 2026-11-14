# 63. Name each of a dek.pub talk's details for what it is, and give its duration from the frontmatter

Date: 2026-11-14

## Status

Accepted

Amends [59. Give the dek.pub talk page a side column of slides and details, and keep the review in a panel](0059-give-the-dek-pub-talk-page-a-side-column-of-slides-and-details-and-keep-the-review-in-a-panel.md)

## Context

ADR 59 gave the side column the talk's details: the speaker, the talk's date, the version shown, and its length in slides. The labels did not say what each one was:

- "Speaker" (話す人) was the deck's owner, the account that publishes it. That is not always the person who gives the talk.
- "Date" (日付) did not say which date. It is the day of the talk, from the frontmatter, not the day a version was uploaded.
- "Length" (長さ) gave a slide count. For a talk, length means time.

A deck's frontmatter already says how long the talk runs: `duration`, in minutes such as `12m`, which lint checks the script against. dek.pub never received it.

## Decision

**The details are named for what they are:**

| Label | 日本語 | Value |
|---|---|---|
| Author | 作成者 | the deck's owner |
| Talk date | 発表日 | the frontmatter's `date`, when there is one |
| Version | 版 | the version shown |
| Duration | 時間 | the frontmatter's `duration`, as "12 min" / "12 分", when there is one |
| Slides | スライド数 | the number of slides |

**The manifest carries `duration`** (`VersionManifest.duration`), as the frontmatter writes it, the way it carries `event` and `date`. `dekc pub publish` sends it when the frontmatter has one. The server keeps it on the deck, from each version it publishes, as whole minutes (`decks.minutes`).

The field is optional, so the protocol version stays as it is. A dekc that does not send it publishes as before, and its talks show no duration.

**What was not chosen:**

- **Leaving the length as a slide count, labelled clearly.** The frontmatter has the time, and time is what a reader of a talk asks about.
- **Working the time out from the script.** Lint estimates speaking time, but the author's `duration` is the time the talk was given in.
- **Keeping the duration as text, as `talk_date` is.** As minutes it can be formatted per language, and later sorted or filtered.

## Consequences

- `side-column.svelte` takes `minutes`, and leaves the row out when it is null.
- `tests/browser/side-column.test.ts` checks each label and value, and the row left out. `tests/cli/pub-publish.test.ts` checks that the manifest carries `duration`. `tests/unit/deck.test.ts` checks how a duration becomes minutes.
- A migration adds `decks.minutes`. Decks published before it show no duration until their next version.
- The talk card and the profile could show the duration too. They do not yet.
