# 96. Link the docs to the sample decks on dek.pub, and stop building them into the docs site

Date: 2026-11-15

## Status

Accepted

## Context

The docs site served the sample decks itself. `bun run docs:build` ran `docs:samples` first, which built `sample/` with `--root-dist` and copied each deck's HTML and link-preview picture into `docs/public/samples/`. `docs/samples.md` and its Japanese copy linked to `/samples/<deck>.html`, written without the base as ADR 41 describes. `sample/dek.toml` set `url` to `https://hajimism.github.io/dek/samples/`, so the build wrote Open Graph tags and took the pictures. Taking them needs Chromium, so the Pages workflow installed Chromium and the Noto CJK fonts, and relaxed AppArmor for Chromium's sandbox, only for this step.

The decks are now published on dek.pub as @dek (ADR 95), at `https://dek.pub/@dek/<deck>`. A talk page there shows the slides in a viewer, with a title, the deck's metadata, and a link card that dek.pub makes. That is what a reader of the docs wants from a sample.

## Decision

**The docs link to the talks on dek.pub.** `docs/samples.md` and `docs/ja/samples.md` link each deck to `https://dek.pub/@dek/<deck>`, and say how to build a deck from `sample/` to present it with the keys. Both READMEs name @dek beside the sample.

**The docs site builds no deck.** `docs:samples` is removed, and `docs:build` is `vitepress build docs` alone. The Pages workflow no longer installs Chromium or the CJK fonts, and no longer relaxes AppArmor. CI's docs build runs after the tests, which still install all three.

**`sample/dek.toml` has no `url`.** The sample's `dist/` is published nowhere, so there is no URL to name. `dekc build` in `sample/` still writes the title and description, and says that the card needs a URL.

**The old addresses forward.** `docs/public/samples/<deck>.html` is committed for each of the three decks. Each is a small page that sends the reader to the talk on dek.pub with a meta refresh and names it as the canonical URL. The folder is no longer ignored. The pictures at `/dek/samples/<deck>.png` are gone.

This replaces only the part of ADR 41 on linking the built samples. Its other decisions stand.

## Consequences

- Links already shared to `hajimism.github.io/dek/samples/<deck>.html` reach the talk on dek.pub. A link to one of the old pictures breaks.
- The Pages deploy no longer downloads a browser or fonts, so it is faster and has fewer steps that can stall.
- The samples on the docs site no longer follow `main` on every deploy. They show what was last published to @dek, and someone has to republish them with its key after the sample changes (ADR 95).
- The samples page depends on dek.pub being up. When it is down, the docs still say how to build the decks locally.
