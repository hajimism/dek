// The page in another language: the same page, query and fragment, with only `lang` changed. The
// server keeps the choice in a cookie from there on.

import type { Lang } from "../common/i18n.ts";

export function langHref(here: URL, lang: Lang): string {
  const url = new URL(here);
  url.searchParams.set("lang", lang);
  return `${url.pathname}${url.search}${url.hash}`;
}
