# 65. Open dek.pub in Japanese, choose the language in the footer, and show the theme in use

Date: 2026-11-14

## Status

Accepted

## Context

dek.pub picked a reader's language from `?lang=`, then the `lang` cookie, then the browser's Accept-Language, and fell back to English. Its first readers and authors are Japanese. A browser set to English, as the ones agents and test runs drive usually are, opened it in English, and a Japanese reader had to find the switch.

The switch was a link in the header, labelled with the other language ("EN" or "日本語"). The footer had the same link. The header is where every page's tools sit, and a choice made once does not need a place there.

The theme button showed the choice, not the result. Under the system's theme it showed a monitor, so the button never said whether the page was light or dark.

The footer's "Built with dek" was translated as 「dek で作られています」. It names the tool, and reads better as its name.

## Decision

**A reader who has not chosen reads dek.pub in Japanese.** The language is `?lang=`, then the `lang` cookie, then Japanese. The browser's Accept-Language is no longer read (`pickLang` in `common/i18n.ts`). Choosing a language still sets the cookie.

**The language is chosen in the footer**, with a select that lists each language by its own name: 日本語, English. A change opens the same page, query and fragment with `?lang=` set (`langHref`). The header has no language link.

**The theme button shows the theme in use:** a sun for light, a moon for dark. Under the system's theme, both icons are drawn, and the `prefers-color-scheme` media query keeps one. So the first paint is right before any script runs. The menu still offers System, Light and Dark, and its label still names the choice.

**The footer says "Built with dek" in both languages**, marked `lang="en"`.

**What was not chosen:**

- **Accept-Language with Japanese as the fallback.** Nearly every browser sends some list, so the fallback would almost never apply, and an English browser would still open the site in English.
- **Keeping the header link as well.** One place to choose is enough, and the header keeps only what every page needs.
- **Working out the system's theme in script.** The server cannot know it, so the first paint would show the wrong icon until the page ran.

## Consequences

- Agents and tests that read dek.pub's pages get Japanese unless they pass `?lang=en` or set the cookie. The e2e run reads the API, not page text, and is unaffected.
- `tests/unit/common.test.ts` checks the order the language is picked in, and the footer's words in both languages.
- `followLang` is gone. The footer builds the link with `langHref` when the select changes.
