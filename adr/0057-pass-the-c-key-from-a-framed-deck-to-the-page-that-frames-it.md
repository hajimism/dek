# 57. Pass the c key from a framed deck to the page that frames it

Date: 2026-11-14

## Status

Accepted

## Context

dek.pub is to get a full-screen viewer with a comments mode: the review panel opens to the right of a smaller slide (the comment requirements, piece D). The mode is to be reached from a button in the viewer's header, and from the keyboard with `c`, as a reader who moves the deck with the keys expects.

While the reader works the deck, the focus is in the deck's frame. The frame is a document of another origin (ADR 45), so a key pressed there never reaches the framing page. The page has no other way to hear it.

What shapes the answer:

- **The player's own letters** are `a f l m p s` (`DEK_KEYS` in `src/core/plugin.ts`); a plugin may take any other letter for `page.keys`, and takes it by preventing the key's default. `c` is no key of the player's, but a plugin may have taken it.
- **The embed API is the one channel** between a framed deck and its page (ADR 45). A page reads a message only when it knows its `type`, and a page written for the current API ignores any other.
- **Decks built with an earlier dek will stay on dek.pub** and send nothing new.

## Decision

**A framed deck posts `{ type: "dek:key", key: "c" }` when the reader presses `c` in it**, and does nothing else with the key. It posts only:

- outside a field on a slide (`isTextEntry`);
- with no Alt, Ctrl or Cmd, and not as the key repeats (`isLetterKey`);
- when nothing took the key first.

The listener is on the window, so it runs after the player's and every plugin's listeners on the document; a key one of them prevented stays theirs. The keys a deck passes are listed in `EMBED_KEYS` in `src/core/embed-protocol.ts`, and the message is part of `EmbedMessage`. A deck that is not framed has no embed API and passes nothing.

**`EMBED_PROTOCOL` stays 1.** The message is one more a deck may send. A page that does not know it ignores it, which is the rule ADR 45 set for when the number goes up. A page cannot tell from `dek:ready` whether a deck passes keys: it offers the same action through a control of its own, and the key works where the deck is new enough.

**What was not chosen:**

- **Reserving `c` for the player** by adding it to `DEK_KEYS`. A plugin that took `c` would stop loading, which is a breaking change to plugins for a key only framed decks need.
- **Passing every key the player does not use.** The page would hear what the reader types into the deck for any purpose, and a key sent today could not be taken back without breaking a page. One key, named, is a promise that can be kept.
- **Moving focus out of the frame** so the page hears keys itself. The deck's own keys would then stop working.

## Consequences

- `docs/reference/embed.md` (en and ja) lists `dek:key` among what the deck sends, and says why a page needs it.
- `tests/runtime/embed-player.test.ts` checks that `c` is passed, and not from a field, with a modifier, as it repeats, or after a plugin took it.
- dek.pub reads `dek:key` in its own change, and keeps a button for the comments mode for decks built with an earlier dek.
- Another key for the page is a change to `EMBED_KEYS`, its docs, and an ADR like this one.
