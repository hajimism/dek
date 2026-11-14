# 76. Keep dek.pub's public comments in the deck model beside its likes, and call a feature a task a page or a route carries out

Date: 2026-11-14

## Status

Accepted

Amends [50. Organise dek.pub's code by the model a person deals with](0050-organise-dek-pub-s-code-by-the-model-a-person-deals-with.md)

## Context

ADR 50 grouped `apps/pub` by the model a person deals with, and ADR 56 split a talk's comments into public comments and review threads. The public comments went into `src/model/comment/public/`, under the review threads. A review of the models found that the two share almost nothing in code:

- Public comments use no anchor, no quote, no scope, no thread number, no notice and no mute.
- What they took from the comment model was a composer, its drafts, and `authorOf`. The composer is a text field with a checkbox that only review threads use. `authorOf` turns an account into the name a comment shows, and they reached into the comment store for that alone.
- Their rules are the deck's. A talk anyone may open has public comments: `publicCommentsOn` had become `opensToAnyone` under another name, and it is also the first half of `canLike`. ADR 56 pairs public comments with the like, and the like already lives in `deck/like/`.

ADR 50 also named the features and said what makes one: "a task that spans models, or reaches outside". Since then the code has gone its own way:

- `person/feature/sign-in` and `deck/feature/sitemap` exist, and ADR 50 names neither; `apps/pub/AGENTS.md` names the sitemap only.
- `deck/feature/manage` and `deck/feature/publish` read and write only the deck and its submodels, so by ADR 50's wording they are not features. The criterion that was actually followed is "a task a page or a route carries out that takes more than one store function".
- `deck/like/` and `deck/public-comment/` are not in the list of the deck's submodels.

## Decision

**Public comments are a submodel of the deck: `src/model/deck/public-comment/`,** beside `deck/like/`. It holds `access.ts`, `store.server.ts`, `view.ts`, `drafts.ts` and `ui/public-comments.svelte`. The routes stay at `/api/decks/:id/public-comments`, and nothing a client sends or receives changes.

What the two kinds of comment shared goes where both can reach it:

- **`authorOf` goes to the person model,** in `person/person.ts` beside `profileOf` and `meOf`.
- **The composer goes to `src/common/ui/composer.svelte`.** It holds the field, the draft and the buttons, and calls `onsubmit` with the text. The review thread's composer, `comment/ui/composer.svelte`, wraps it and adds the scope checkbox. A public comment's `onpost` takes the text, so it can no longer carry a thread's `scope`.
- **Drafts are kept by `src/common/ui/drafts.ts`,** and each model makes its own keys with `draftKey`. The keys stay as they were, so a draft kept before the move comes back after it.

**A feature is a task a page or a route carries out that takes more than one store function:** loading a page, publishing a version, signing in, connecting the CLI, writing the sitemap. It may span models or reach outside, but need not. A task one store function does, such as resolving a thread, stays in its model. The rules on what may import what are ADR 50's, unchanged: a model's own files import no feature, and a feature imports no other feature.

**The layout today,** which `apps/pub/AGENTS.md` lists:

- the deck's submodels: `grant/`, `version/`, `serving/`, `like/` and `public-comment/`;
- the deck's features: `publish`, `talk`, `manage` and `sitemap`;
- the person's features: `connect-cli`, `profile` and `sign-in`.

**What was not chosen:**

- **Public comments as a model of their own,** after deck in the order. It would add a model for one table whose every rule comes from the deck. Likes made the same choice.
- **Leaving them under `comment/`.** The nesting says they are a kind of review thread, which ADR 56 decided they are not.
- **One composer with a `scopes` switch, kept in `comment/`.** The deck may not import the comment model, so public comments could not use it.
- **Moving `manage` and `publish` out of `feature/` to fit ADR 50's wording.** They are where a reader looks for the manage page and the publish route. The wording was out of step, not the code.

## Consequences

- `src/model/comment/` holds review threads alone: their anchor, quote, scope, numbers, notices and mute.
- `tests/unit/deck.test.ts` checks the public comments' rules, which moved from `tests/unit/comment.test.ts`. The drafts test in `comment.test.ts` checks that every key is the string it was before.
- `tests/browser/public-comments.test.ts` expects `onpost` to be called with the text.
- The composer's words, "⌘↵ to send" and the "Comment" button, are still `comment.*` keys in `i18n.ts`, which a component in `common/` now reads too.
- The boundaries test fails on a folder in `src/model/` that is not in the order of models, but a new submodel or feature only needs a folder and passes it.
