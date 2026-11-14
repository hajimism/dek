// What `/robots.txt` says. dek.pub itself is open to crawlers but for its JSON API; any other
// origin the app runs on, staging or a machine's, is closed to all of them, so nothing but the
// real site is ever indexed. Pages that should not be found (sign-in, a private talk) also say
// `noindex` themselves. Only dek.pub names its sitemap (ADR 72).

/** The one origin crawlers may read. */
const SITE = "https://dek.pub";

/** `appOrigin` is compared as an origin, so `https://dek.pub/` is dek.pub too. */
export function robotsFor(appOrigin: string): string {
  if (new URL(appOrigin).origin !== SITE) {
    return "User-agent: *\nDisallow: /\n";
  }
  return `User-agent: *\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`;
}
