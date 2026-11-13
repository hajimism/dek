// The other language's link: the same page, query and fragment, with only `lang` changed. The
// server renders `?lang=…` alone; the click fills in the rest from where the reader is now.

import type { Lang } from "../common/i18n.ts";

export function langHref(here: URL, lang: Lang): string {
  const url = new URL(here);
  url.searchParams.set("lang", lang);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function followLang(
  event: MouseEvent & { currentTarget: HTMLAnchorElement },
  lang: Lang,
): void {
  event.currentTarget.href = langHref(new URL(window.location.href), lang);
}
