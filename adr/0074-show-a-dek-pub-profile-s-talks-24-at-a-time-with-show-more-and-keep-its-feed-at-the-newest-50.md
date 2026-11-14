# 74. Show a dek.pub profile's talks 24 at a time with Show more, and keep its feed at the newest 50

Date: 2026-11-14

## Status

Accepted

Amends [62. Show a dek.pub profile's talks as a gallery or a timeline, in tabs](0062-show-a-dek-pub-profile-s-talks-as-a-gallery-or-a-timeline-in-tabs.md)

## Context

A profile, `/@handle`, lists every talk its owner has published, one card each. Each card reads its version from D1, so the page does as many reads as the person has talks, and nothing bounds how many that is. The RSS feed, `/@handle/rss`, takes the newest 50.

The query also counted decks that have no version readers see. `cardsOf` dropped them after the query, so a `LIMIT` could come back with fewer cards than it asked for. And it ordered talks by `talk_date` alone, which puts a talk with no date after every dated one, while the timeline files such a talk under the year it last changed.

A reader comes to a profile to look down what the person has given, not to find the fifth page of it. The timeline is a run of years, and pages would cut a year in two, with its heading on each side.

## Decision

**A profile shows its 24 newest talks, and Show more below them adds the next 24 in place.** The button says how many are left, as "Show more (38 left)", and is not drawn once none are. Focus moves to the first talk it added. The timeline groups every talk loaded so far by year, so a year has one heading however the talks were loaded. If the talks cannot be loaded, a toast says so and the button stays to try again. 24 fills every row of the gallery, whether the screen gives it one, two or three columns.

**Show more is a link to `?page=2`, and further.** A crawler, or a browser without scripts, follows it to a page of its own with the next 24, so every talk can be reached from the profile. With scripts, the page takes the next 24 from `GET /api/people/<handle>/talks?page=<n>`, which answers `TalkPage`, `{ talks, total }`, with the same rules as the page: the owner's talks for the owner, the public ones for anyone else. The address does not change as more load, so a reload starts again from the newest. A `?page=` that is not a whole number from 1 means page 1, and one past the last page is a 404, from the API too. A page after the first links back to the newest talks above its list.

**A page's canonical URL names its page and not its view:** `/@handle` for page 1, `/@handle?page=2` after it. The gallery and the timeline show the same talks. The sitemap lists page 1 (ADR 72).

**Talks are ordered by the day they count as given:** their date, else the day the deck last changed, as the timeline already files them, then by when they changed, then by the deck's ID, so pages never overlap. Only decks with a version readers can open count, in SQL, so every page but the last is full. The owner still sees their talks that are not public, with their badges, and only the owner's count includes them.

**`TalkCard` and `TalkPage` move into `src/pub/protocol.ts`,** as the shapes of an `/api/` answer do; the app's `TalkCard` is the protocol's.

**The feed stays at the newest 50.** A feed reader keeps what it has already read, so it needs only what is new. Readers looking for older talks use the profile.

**What was not chosen:**

- **Numbered pages, with links to the newer and the older page.** They suit a list where where one is matters, such as search results. A profile is looked down, and pages would move the reader back to the top each time and split the timeline's years.
- **Loading more as the reader scrolls.** The footer could never be reached while talks remained, and nothing would say how many are left.
- **Keeping how many are loaded in the address,** so a reload keeps them. `?page=3` would then mean the first 72 talks to a reader but the third 24 to a crawler. The back button already returns to the loaded list where the browser keeps the page.
- **A cursor instead of a page number.** Talks are few per person and rarely change order, and a number is a link anyone can read.
- **An index on `(owner_id, talk_date, updated_at)`.** `decks_owner_slug` already narrows the query to one person's decks, and one person's decks are few enough to sort.
- **Paging the feed (RFC 5005).** Few readers follow such links, and the profile already shows every talk.

## Consequences

- A profile page, and each Show more, reads at most 24 versions.
- A talk published while someone reads a profile may shift what the next 24 are. A talk already shown is not added twice; one that moved across the boundary may be missed until a reload.
- The unit tests check how `?page=` is read, how many pages talks fill and the address of each page. A browser test checks the button, and the e2e run checks the API's answers for the owner and for someone else, and that a page past the last is a 404.
