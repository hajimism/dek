import { escapeAttr } from "./escape.ts";

export type OgpImage = {
  url: string;
  width: number;
  height: number;
};

export type OgpInput = {
  title: string;
  description?: string;
  event?: string;
  date?: string;
  lang: string;
  /** The page's own absolute URL; left out, the page has no og:url. */
  url?: string;
  image?: OgpImage;
};

/** The region Open Graph pairs with a bare language, as `og:locale` wants `ll_CC`. */
const USUAL_REGION: Record<string, string> = {
  ja: "JP",
  en: "US",
  zh: "CN",
  ko: "KR",
  de: "DE",
  fr: "FR",
  es: "ES",
  it: "IT",
  pt: "PT",
  nl: "NL",
  ru: "RU",
};

function ogLocale(lang: string): string | undefined {
  const [language = "", ...rest] = lang.split("-");
  const region = rest.find((part) => /^[A-Za-z]{2}$/.test(part));
  const code = language.toLowerCase();
  const country = region?.toUpperCase() ?? USUAL_REGION[code];
  return country ? `${code}_${country}` : undefined;
}

/**
 * What a link to the page shows when someone shares it: title, description, and, once the
 * page knows where it is served from, its URL and a picture of the first slide. Crawlers only
 * fetch an absolute og:image, so without a URL there is no image at all.
 */
export function ogpHead(input: OgpInput): string {
  const description =
    input.description ?? ([input.event, input.date].filter(Boolean).join(" · ") || undefined);
  const locale = ogLocale(input.lang);
  const tags: Array<[kind: "name" | "property", key: string, value: string | number]> = [];
  if (description) {
    tags.push(["name", "description", description]);
  }
  tags.push(["property", "og:type", "website"], ["property", "og:title", input.title]);
  if (description) {
    tags.push(["property", "og:description", description]);
  }
  if (locale) {
    tags.push(["property", "og:locale", locale]);
  }
  if (input.url) {
    tags.push(["property", "og:url", input.url]);
  }
  if (input.image) {
    tags.push(
      ["property", "og:image", input.image.url],
      ["property", "og:image:width", input.image.width],
      ["property", "og:image:height", input.image.height],
      ["property", "og:image:alt", input.title],
    );
  }
  tags.push(["name", "twitter:card", input.image ? "summary_large_image" : "summary"]);
  const lines = tags.map(
    ([kind, key, value]) => `<meta ${kind}="${key}" content="${escapeAttr(String(value))}">`,
  );
  if (input.url) {
    lines.push(`<link rel="canonical" href="${escapeAttr(input.url)}">`);
  }
  return lines.join("\n  ");
}

/**
 * The URL dist/ is served from, ending in a slash so a deck's file name joins onto it, or
 * undefined when a crawler could not fetch it: not absolute http(s), or carrying a query.
 */
export function parsePublicUrl(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.search || url.hash) {
    return undefined;
  }
  return url.href.endsWith("/") ? url.href : `${url.href}/`;
}
