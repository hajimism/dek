# 81. Open a dek.pub link talk only with the key its URL carries

Date: 2026-11-14

## Status

Accepted

Amends [47. Put a talk on dek.pub with the dekc pub commands](0047-put-a-talk-on-dek-pub-with-the-dekc-pub-commands.md)

Amends [56. Split dek.pub comments into public comments and review threads, and add a like](0056-split-dek-pub-comments-into-public-comments-and-review-threads-and-add-a-like.md)

Amends [71. Keep only a dek.pub deck's current version, and show a deck to its team alone until its visibility reaches its guests](0071-keep-only-a-dek-pub-deck-s-current-version-and-show-a-deck-to-its-team-alone-until-its-visibility-reaches-its-guests.md)

## Context

A `link` deck is meant for the people given its address. Its pages already say `noindex`, and no listing, feed, sitemap (ADR 72) or landing page names it. But its address is `/@handle/slug`. The handle is on the owner's profile, and the slug is usually the deck folder's name, so anyone who guesses the slug can open the talk. ADR 71 says that `link` and `public` are open to everyone, and `canView` let any `link` deck through.

The talk page is not the only way in. The pictures at `/i/<id>/<n>/<name>` and the API under `/api/decks/<id>/` (public comments, likes, mute, review threads) go through `visibleDeck`, which also let a `link` deck through to anyone. The deck ID in those paths is no secret. `dekc pub publish` writes it into `script.md` as `pub:`, and the docs say to commit that line, so a talk's ID is in every clone of its repository, public ones included. It also appears in the talk page: in the frame's host `d-<id>` and in the pictures' paths.

The serve Worker hands out a deck's files without a token only for a `public` deck's current version. Every other deck needs a token, which `frameOf` signs on the talk page after the loader has let the reader in.

## Decision

**A `link` deck opens to someone with no standing only at `/@handle/slug?key=<key>`.** The owner and anyone holding a grant open it without the key, as they open a `private` deck. Anyone else gets the same 404 as for a deck that does not exist, whether they ask without the key or with a wrong one.

- `canView` takes the key the request carries, and opens a `link` deck when `sameKey(deck.linkKey, key)`.
- A key opens no other visibility. A `private` or `team` deck that keeps a key from its time as `link` ignores it.

**The key is a column of the deck, `decks.link_key`.** It is null until the deck first becomes `link`, and is made then.

- `newLinkKey` draws 26 characters from the ID alphabet (`0-9a-z`), about 134 bits.
- `sameKey` compares the whole key, in a time that does not depend on where the keys differ. It refuses a missing or empty key. Every key has the same length, so checking the length first gives nothing away.

**The key survives a change of visibility.** A deck taken from `link` to `private` and back opens at the URL it had. The owner can close a talk for a while without breaking every link they handed out. Only a new link replaces the key.

**The owner makes a new link with `dekc pub share --new-link`, or with New link on the manage page.** Both send `PATCH /api/decks/:id` with `newLink: true` in `ShareRequest`. It can go in the same request as the other settings.

- `sharePatch` (`deck.ts`) turns a share request into the columns it changes: the settings, plus a new `linkKey` when the request asks for one, or when it makes the deck `link` and the deck has no key yet. It is the one place a key is made, and its result goes through `updateDeck` as every change does.
- After a new link, the old URL opens nothing.
- The manage page asks before it makes a new link and offers no Undo, since the old key is gone. The button shows only while the deck is `link`.
- The flag and the request field are also taken on a deck that is not `link`. The deck gets a new key, which it opens by once it is `link`.

**The URLs handed out carry the key; the URLs only the people with standing read do not.** `talkHref(handle, deck)` is `talkPath` plus `?key=` when the deck is `link`. `shareUrl`, `deckStatus` and the talk loader use it, so these carry the key:

- `DeckStatus.url`, which `dekc pub share`, `status` and `open` print, and `PublishResult.url`;
- the talk page's Share button and a slide's copied link;
- the manage page's Open talk and its link back to the talk.

`talkUrl` is the bare path, for the URLs whose readers are the owner and the grantees, who open the talk without the key:

- `CommentRow.url`, which `dekc pub comments --json` prints, the talk page's copied link to a review thread, and the reply and thread notice mails. An agent pastes these into commits and pull requests, often in public repositories, and the key would open the talk to whoever reads them, while it opens no review thread to anyone.
- The invitation mail. An invitation by address leads to sign-in, as `signInHref` of the bare path, and the grant on the address opens the talk once it is verified, before or after an account is made. An invitation by handle goes to an account that already exists. A grantee by handle who is signed out in that browser gets the 404 page, with its Sign in button, as for a `private` deck.

**The talk page shows the key in the address bar to whoever opened a `link` talk by standing.** When the owner or a grantee opens it at the bare path, or at an old key, the page puts the current key in the URL with `history.replaceState` (`withLinkKey`), keeping the fragment and any other query. The address they copy then opens the talk for others too. The page's own `history.replaceState` to a `#slide` keeps the query. The sign-in link on the talk page keeps the key through sign-in, since `signInHref` takes the path with its query.

**The deck ID opens nothing by itself.** Anyone with a clone of the repository has it, so every route keyed by deck ID takes the key from `?key=` and passes it to `visibleDeck`: the pictures, the public comments, the likes, mute and the review-thread routes.

- The talk page adds the key to the requests a reader without a grant makes: its pictures, the `og:image`, the public comments and the like. Mute and the review threads need a grant, so the page sends them no key.
- The serve token is unchanged. `frameOf` signs one only after the loader has checked the key. A token already signed keeps working until it expires, at most ten minutes after a new link.

**The canonical URL and `og:url` are the path without the key; `og:image` carries the key.** A search engine is given no key to index, and the page says `noindex` anyway. A link preview is made by fetching the URL that was shared, key included. The preview then needs the picture, which the key opens, and whoever fetches the picture already holds the page's URL with the same key. A `link` deck's picture is still sent `private, no-store`, as before.

**The app's `referrer-policy` stays `strict-origin-when-cross-origin`** (`src/shell/headers.ts`, ADR 67). Another site linked from the talk page, the frame on the deck's origin, Google Fonts and GitHub's avatars are sent the origin alone, never the query. The deck's origin sends `no-referrer`. The API logs a failed request by its path alone, without the query (`src/common/http.server.ts`). An error a page's loader throws is logged whole by Void's error handler, as the Logs item in the app's list of what it does not do yet says. Workers Logs, once they are turned on, keep each request's full URL, key included.

**`opensToAnyone` becomes `opensWithoutGrant`.** It still says whether a deck has public comments and likes (ADR 56), but a `link` deck no longer opens to anyone. `canView` checks for `public` and for the key itself.

- `DeckRules` stays the shape the comment and like rules read. `OpeningRules` adds `linkKey`, for `canView`, `standingOn` and `mayBeNoticed`.
- Mail about review threads counts grants alone, so `mayBeNoticed` passes no key.

**`PROTOCOL_VERSION` stays 2.** `ShareRequest` gains an optional field, and the answers are unchanged.

- An older dekc never sends `newLink`.
- A newer one sends it only for `--new-link`. An older server holds a request to its shape strictly, so it answers that with an error rather than ignoring it.
- Nothing is deployed yet.

**What was not chosen:**

- **A key for every deck when it is made.** The column would never be null. But SQLite cannot add a `NOT NULL` column with a random default to a table that has rows, and decks that are never `link` would hold a secret no one uses. Making the key on the first `link` keeps one rule in one function.
- **A random slug in place of the readable one.** The `/@handle/slug` URL would stop naming the talk, and the owner's own links, profile and manage page would change with it.
- **Letting the deck ID stand in for the key on the routes keyed by it.** That works only if the ID is secret, and `pub:` in `script.md` is committed by design.
- **A cookie set when a reader first opens the talk with its key.** The page's later requests could then drop the key. But the cookie would outlive a new link in every browser that had it, and the API would depend on a cookie the CLI never holds.
- **Putting the key on every link to a `link` talk its owner follows, such as their profile's cards.** Each place would need the key, and one left out would still put a bare path in the address bar. The talk page sets the address wherever it was opened from.
- **Keys in review threads' links and in mail, so that any URL dek.pub gives is one to pass on.** Their readers need no key, and `dekc pub comments` hands these URLs to agents, which paste them where anyone may read them.
- **Dropping the key once the talk becomes `private`.** The URLs given out would break every time the talk was closed for a while. A key that opens only a `link` deck gives nothing to whoever holds it while the deck is not `link`.

## Consequences

- A `link` talk's address cannot be guessed. Its URL is longer, and a reader who cuts the query off gets a 404.
- A new link breaks every shared URL given out. The links in comments and mail carry no key, so a new link leaves them working for the people they were for.
- Revoking a grant on a `link` deck does not lock its grantee out: they may still hold the key from the address bar or a shared URL, until the owner makes a new link.
- A key leaked with its URL opens the talk until the owner makes a new link. Nothing makes a key expire.
- Whoever reads the Workers Logs, once they are on, can read the keys of the `link` talks opened.
- `dekc pub share --new-link` is a new flag. Its docs, `llms.txt` and the command's usage name it. The JSON answers are unchanged.
- A new route keyed by deck ID has to pass `requestKey(c)` to `visibleDeck`. A route that leaves it out stays closed to a key holder without a grant: it fails closed.
- The migration adds `link_key` as a nullable column. A `link` deck in a local database from before this change has no key. It opens only to its owner and its grants until it is set to `link` again or given a new link.
