# 62. Show a dek.pub profile's talks as a gallery or a timeline, in tabs

Date: 2026-11-14

## Status

Accepted

## Context

A profile page listed its talks in one narrow column, as wide as the article on a talk page, grouped by year: a small cover, then the title and the meta. That reads well as a record of when someone spoke. But it shows little of each talk, and on a wide screen most of the page stays empty.

A talk is a set of slides, and its cover says most about it at a glance. The landing page already shows talks as a grid of covers (`talk-card.svelte`). The profile also needs the record by year, which is the order an author keeps their talks in.

## Decision

**The profile page is as wide as the rest of the app** (`--container`), not the article's measure.

**Its talks sit under two tabs** (`common/ui/tabs.svelte`, `person/feature/profile/ui/profile-talks.svelte`):

- **Gallery**, the default: the covers in a grid, three across from 1024 pixels, two from 640, one below. Each card is the landing page's, without the owner, since the whole page is theirs.
- **Timeline**: the list by year that the page had before.

The tabs follow the ARIA tabs pattern. The arrow keys, Home and End move to a tab and show it at once, since a tab only changes how the same talks are shown.

**The view is kept in the address**, as `?view=timeline`. The gallery has no parameter. The server reads it, so a reload or a shared link opens the view that was showing, with no flash of the other. Switching replaces the history entry instead of adding one.

**The owner sees each talk's visibility in both views.** The card takes it as an optional `visibility`, which only the owner's page passes.

**What was not chosen:**

- **A segmented control.** It chooses a setting. These tabs show one of two panels, and the tabs pattern says so to a screen reader.
- **Links that load the page again for each view.** The talks are already on the page, so a switch has nothing to fetch.
- **Remembering the view in the browser.** A link someone shares should open what they saw, and the address does that.

## Consequences

- `tests/browser/profile-talks.test.ts` checks the gallery as the default, the owner's visibility badges, and the switch to the timeline by click and by arrow key. `tests/unit/person.test.ts` checks how an address picks a view.
- `talk-card.svelte` can show a visibility badge, and the icon set gains `grid` and `timeline`.
- Any later view, such as one by event, is another tab and another value of `ProfileView`.
