// `/sitemap.xml`: the pages dek.pub lets search engines index, and nothing that says `noindex`.
// The landing and About pages come in each language, each naming the others; then the public talks,
// newest first, and the profile of everyone who gave one (ADR 72).

import { DEFAULT_LANG, LANGS } from "../../../../common/i18n.ts";
import { xmlText } from "../../../../common/xml.ts";
import { langUrl } from "../../../../shell/lang-url.ts";
import { profilePath } from "../../../person/profile-path.ts";
import { talkPath } from "../../deck.ts";

/** A public talk with a version readers see. */
export type SitemapTalk = { handle: string; slug: string; updatedAt: string };

/** What the sitemap protocol allows in one file. */
export const SITEMAP_BOUND = 50_000;

/** The pages written in every language. */
const PAGES = ["/", "/about"];

/** The languages, the default first, as its URL is the bare one. */
const ORDER = [DEFAULT_LANG, ...LANGS.filter((lang) => lang !== DEFAULT_LANG)];

function entry(loc: string, lines: readonly string[] = []): string {
  return ["  <url>", `    <loc>${xmlText(loc)}</loc>`, ...lines, "  </url>"].join("\n");
}

function lastmod(updatedAt: string): string {
  return `    <lastmod>${xmlText(updatedAt)}</lastmod>`;
}

function pageEntries(origin: string): string[] {
  return PAGES.flatMap((path) => {
    const link = (hreflang: string, href: string) =>
      `    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${xmlText(href)}" />`;
    const alternates = [
      ...ORDER.map((lang) => link(lang, langUrl(origin, path, lang))),
      link("x-default", langUrl(origin, path, DEFAULT_LANG)),
    ];
    return ORDER.map((lang) => entry(langUrl(origin, path, lang), alternates));
  });
}

/**
 * The sitemap of `origin`, from `talks` newest first. Past `bound` URLs, the oldest talks are left
 * out, along with any profile only they would bring in.
 */
export function sitemapOf(
  origin: string,
  talks: readonly SitemapTalk[],
  bound = SITEMAP_BOUND,
): string {
  const pages = pageEntries(origin);
  const kept: string[] = [];
  const profiles = new Map<string, string>();
  for (const talk of talks) {
    const urls = pages.length + kept.length + profiles.size;
    const needed = profiles.has(talk.handle) ? 1 : 2;
    if (urls + needed > bound) {
      break;
    }
    kept.push(entry(`${origin}${talkPath(talk.handle, talk.slug)}`, [lastmod(talk.updatedAt)]));
    const newest = profiles.get(talk.handle);
    if (!newest || talk.updatedAt > newest) {
      profiles.set(talk.handle, talk.updatedAt);
    }
  }
  const people = [...profiles].map(([handle, updatedAt]) =>
    entry(`${origin}${profilePath(handle)}`, [lastmod(updatedAt)]),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${[...pages, ...kept, ...people].join("\n")}
</urlset>
`;
}
