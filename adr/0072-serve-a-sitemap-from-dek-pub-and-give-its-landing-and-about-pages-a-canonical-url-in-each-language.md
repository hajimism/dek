# 72. Serve a sitemap from dek.pub, and give its landing and About pages a canonical URL in each language

Date: 2026-11-14

## Status

Accepted

Amends [68. Serve robots.txt and security.txt from dek.pub, and take its reports where dek's go](0068-serve-robots-txt-and-security-txt-from-dek-pub-and-take-its-reports-where-dek-s-go.md)

## Context

A crawler finds a public talk on dek.pub only by following links: from the landing page's nine newest, or from a profile. Nothing lists every page that may be indexed, and ADR 68's `robots.txt` names no sitemap, since there was none.

The landing page and the About page are written in both languages, and ADR 65 tells the two apart by `?lang=` or the `lang` cookie on one URL. Without a cookie, which a crawler never sends, the bare URL is Japanese. Neither page names a canonical URL, and neither says where the other language is. A search engine may then fold the English into the Japanese, or show the English page to a Japanese reader. A talk page and a profile already name their canonical URL. What they hold is the author's, in one language; only the header and the footer follow the reader's.

## Decision

**`/sitemap.xml` is a route, `routes/sitemap.xml.ts`.** The deck feature `src/model/deck/feature/sitemap/` writes it, on `APP_ORIGIN`, and it lists only what may be indexed:

- the landing page and the About page, once in each language, each with `xhtml:link` alternates for both languages and `x-default`;
- every public talk with a current version, at its `/@handle/slug`, with `lastmod` from when the deck last changed;
- every profile with such a talk, with `lastmod` from its newest one.

A `link`, `private` or not-yet-published talk is never listed, and neither is any page that says `noindex`. The sitemap protocol allows 50,000 URLs in one file, so the newest talks are kept up to that bound. A sitemap index is a change of its own, for when dek.pub nears it. The answer is cached for an hour, as `robots.txt` is.

**`robots.txt` on dek.pub names it** with `Sitemap: https://dek.pub/sitemap.xml`. On any other origin it still keeps every crawler out and names no sitemap.

**Japanese, the default language, lives at the bare URL, and English at `?lang=en`.** The landing page and the About page name as canonical the URL of the language they were rendered in. A page rendered in Japanese names `/about`, even when it was asked for as `/about?lang=ja`; one rendered in English names `/about?lang=en`, even when it was asked for as `/about` with the cookie. Each also links both languages with `hreflang`, plus `x-default` at the bare URL, and its `og:url` is its canonical URL. `src/shell/lang-url.ts` makes these URLs, and the sitemap uses the same function. These pages are not cached by anyone between dek.pub and the reader, so a canonical URL that follows the cookie never reaches someone it does not fit.

**A talk page and a profile keep the one canonical URL they have,** the bare one, with no `hreflang`: what they hold has one language, whichever language their header and footer are in.

**What was not chosen:**

- **A path for each language, such as `/en/about`.** ADR 65 chose `?lang=`; a path would change every link the pages make, for two pages.
- **`?lang=ja` as the canonical URL of the Japanese page.** The bare URL is what links and crawlers reach. If it were not canonical, the URL most often found would be the one search engines are told to drop.
- **Building the sitemap at deploy.** Talks are published and made public while dek.pub runs.
- **Listing `link` talks.** Their pages say `noindex`, and their address is meant to be known only to those given it.

## Consequences

- A public talk can be found without a link to it, as soon as it is public.
- The unit tests check the sitemap's text, `robots.txt` and the URLs of each language. The e2e run checks that `/sitemap.xml` on `vp dev` answers, lists the About page and does not list a `link` talk.
- A third language adds a value to `LANGS` and nothing here, since the URLs are made from that list.
- Past 50,000 URLs, the oldest talks fall out of the sitemap, though not out of the index, until it is split.
