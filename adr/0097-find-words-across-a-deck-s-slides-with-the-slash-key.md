# 97. Find words across a deck's slides with the slash key

Date: 2026-11-15

## Status

Accepted

## Context

A reader who remembers a word from a talk, or a speaker who wants the slide that names a figure, has no way to find it but to page through the deck or the rail. The browser's own find (Cmd+F, or `/` in Firefox) reads only what is drawn, and the player draws one slide: every other slide is `display: none` (`src/core/chrome.ts`), and so is a step not shown yet. The same holds inside dek.pub's full-screen viewer, where the deck runs in a frame of another origin (ADR 45, ADR 58) and the page around it holds no slide's words.

What shapes the answer:

- **The player's letters** are `a f l m p s` (`DEK_KEYS`); a plugin may take any other letter, and a letter the player took later would stop such a plugin loading (ADR 57). A plugin's keys are letters only (`src/core/plugin.ts`).
- **Cmd, Ctrl and Alt chords are the browser's** (`keyToMove`, `isLetterKey`), Cmd+F among them.
- **A framed deck has the keys while the reader works it** (ADR 57); the framing page hears none of them.
- **The page carries the words already**: every slide is in the document, and `#dek-data` holds each slide's title and its script as the build's reader may read it (`scriptFor`): all of it in a full build, what is said aloud in a public one, none in `--no-script`.
- **Slide markup is the theme's** (ADR 10): the player adds no element to a slide.

## Decision

**`/` opens a search over the whole deck**, in the player of every page but a video: a file, the dev server, and a deck framed by dek.pub. The key is taken when nothing else has it: not from a field on a slide (`isTextEntry`), with no Alt, Ctrl or Cmd, not as it repeats; Shift is allowed, since some layouts type `/` with it. Taking it prevents the key's default, so Firefox's quick find does not open over it.

**It reads three texts for each slide**, read afresh each time it opens, since a live update or a slide's script may have changed them:

- the words on the slide, from the slide's DOM: every text node but those in `script`, `style`, `template` and `noscript`, including a step not shown yet, with a space where one block of text ends and another begins;
- its title;
- its script, where the page carries one.

Matching folds both sides with NFKC and to lower case, so full- and half-width forms match, and passes over white space, since a line on a slide breaks wherever it fits.

**It lists one row a slide, in the deck's order**: the slide's number, its title, how many times it says the words if more than once, and a quote around one match, from the slide or, when only the script says it, from the script, marked as such. Choosing a row, by Enter or a click, goes to the earliest beat at which the slide shows a match, or to the slide as it arrives for a match in the title or the script, and closes the search. The arrow keys move through the rows; Escape, the close button, or a click outside closes it where it is.

**The words found are highlighted on the slide** through the CSS Custom Highlight API, under the name `dek-search`, until the deck leaves that slide. Nothing is written into the slide; a browser without the API shows no highlight.

**The search is a view of its own**, in a shadow root on `#dek-search`, out of the theme's reach, and printed by no page. Its root stops every key typed in it from reaching the document, where the player would hear a key from the view's host, which is no field: a space would move the deck, and a `c` reach the page that frames it. The quotes are put in as text, never as HTML. Its words are English, or Japanese where the deck's `lang` is.

**What was not chosen:**

- **A letter key**, such as `g` or `k`. It would join `DEK_KEYS`, and a plugin that took it would stop loading: a breaking change for a key `/` serves without one.
- **Cmd+F or Ctrl+F.** They are the browser's, by a rule every key of the player keeps.
- **Search in dek.pub's page.** It holds titles and, for some readers, the script, but no slide's words, and a framed deck already has the keys. Putting it in the player serves a file, the dev server and dek.pub alike, and needs no new field in the slide map or message in the embed API.
- **Wrapping the matches in `mark` elements.** That changes the theme's markup, and what a plugin or the embed API reads from it.

## Consequences

- `docs/guide/present.md` (en and ja) lists `/` among the keys.
- The key hint a built file shows as it opens names `/` beside `s`, since nothing on the page shows that the deck can be searched, and the browser's own find, which a reader tries first, finds only the slide on screen.
- `src/runtime/search.ts` holds the matching, which `tests/runtime/search.test.ts` tests; `tests/runtime/search-player.test.ts` the view in the player; `tests/runtime/embed-browser.test.ts` that, in a framed deck in Chromium, what is typed into the search moves no deck and reaches no framing page, and that the match is highlighted.
- Decks built with an earlier dek, on dek.pub too, have no search until they are built again.
- On a touch screen there is no key to open it.
- In a real full screen, the browser takes Escape to leave full screen; the search stays open, and closes on a second Escape, its button, or a click outside.
