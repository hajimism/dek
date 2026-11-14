// Where a page written in every language lives in each: the default language at the bare URL, the
// others behind `?lang=`. Search engines are told which URL is the page as it was rendered, and
// where the others are (ADR 72).

import { DEFAULT_LANG, LANGS, type Lang } from "../common/i18n.ts";

/** `path` on `origin`, in `lang`. */
export function langUrl(origin: string, path: string, lang: Lang): string {
  return lang === DEFAULT_LANG ? `${origin}${path}` : `${origin}${path}?lang=${lang}`;
}

/** The head links of `path` rendered in `lang`: its canonical URL, then each language's. */
export function langLinks(
  origin: string,
  path: string,
  lang: Lang,
): { rel: string; href: string; hreflang?: string }[] {
  return [
    { rel: "canonical", href: langUrl(origin, path, lang) },
    ...LANGS.map((each) => ({
      rel: "alternate",
      hreflang: each,
      href: langUrl(origin, path, each),
    })),
    { rel: "alternate", hreflang: "x-default", href: langUrl(origin, path, DEFAULT_LANG) },
  ];
}
