// dek's docs, a separate site: VitePress at hajimism.github.io/dek, English at the root and
// Japanese under ja/, each page ending in .html (docs/.vitepress/config.ts keeps cleanUrls off).

import type { Lang } from "./i18n.ts";

const SITE = "https://hajimism.github.io/dek/";

/** A page of the docs, such as `guide/publish`, in `lang`; the home page without one. */
export function docsUrl(lang: Lang, page?: string): string {
  return `${SITE}${lang === "ja" ? "ja/" : ""}${page ? `${page}.html` : ""}`;
}
