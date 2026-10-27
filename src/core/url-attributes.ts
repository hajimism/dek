/**
 * Which attributes name a URL, and where in the value each URL is written. Lint checks exactly
 * these, and the build inlines exactly these, so a reference that passes one never breaks the other.
 */
import { isAsciiWhitespace } from "./attribute-value.ts";

/**
 * What the page does with a URL: a `resource` is loaded to draw the slide, so it must exist and
 * live in the deck's `assets/`; a `link` is only followed when someone activates it.
 */
export type UrlUse = "resource" | "link";

/**
 * Every attribute that names a URL, first match wins. `list` marks a `srcset`, which names one URL
 * per candidate. `href` loads a resource only in SVG; elsewhere it is a link, and `<link>` in a
 * document's head points at the theme, which the build replaces.
 */
const URL_ATTRIBUTES: ReadonlyArray<{
  attr: string;
  use: UrlUse;
  tags?: readonly string[];
  list?: boolean;
}> = [
  { attr: "src", use: "resource" },
  { attr: "srcset", use: "resource", list: true },
  { attr: "imagesrcset", use: "resource", list: true },
  { attr: "poster", use: "resource" },
  { attr: "background", use: "resource" },
  { attr: "data", use: "resource", tags: ["object"] },
  { attr: "href", use: "resource", tags: ["image", "use", "feimage"] },
  { attr: "xlink:href", use: "resource" },
  { attr: "href", use: "link" },
  { attr: "action", use: "link" },
  { attr: "formaction", use: "link" },
];

/** Whether `attr` on a `tag` element names a URL. */
export function isUrlAttribute(tag: string, attr: string): boolean {
  return urlAttribute(tag, attr) !== undefined;
}

function urlAttribute(tag: string, attr: string): (typeof URL_ATTRIBUTES)[number] | undefined {
  return URL_ATTRIBUTES.find(
    (entry) => entry.attr === attr && (entry.tags === undefined || entry.tags.includes(tag)),
  );
}

/**
 * The URLs of a `srcset`, each with its offset in the value, parsed the way the HTML standard
 * does: a URL runs to the next ASCII whitespace, a trailing comma ends it, and the descriptors
 * after it run to the next comma. So `data:` URIs keep their commas.
 */
export function srcsetUrls(value: string): Array<{ url: string; offset: number }> {
  const candidates: Array<{ url: string; offset: number }> = [];
  let index = 0;
  while (index < value.length) {
    while (index < value.length && (value[index] === "," || isAsciiWhitespace(value[index]))) {
      index++;
    }
    const start = index;
    while (index < value.length && !isAsciiWhitespace(value[index])) {
      index++;
    }
    let url = value.slice(start, index);
    if (url.endsWith(",")) {
      url = url.replace(/,+$/, "");
    } else {
      let depth = 0;
      for (; index < value.length; index++) {
        const char = value[index];
        if (char === "(") {
          depth++;
        } else if (char === ")") {
          depth = Math.max(0, depth - 1);
        } else if (char === "," && depth === 0) {
          break;
        }
      }
    }
    if (url) {
      candidates.push({ url, offset: start });
    }
  }
  return candidates;
}

/** The URLs an attribute names, each with its offset into the value; none when it names no URL. */
export function attributeUrls(
  tag: string,
  attr: string,
  value: string,
): { use: UrlUse; urls: Array<{ url: string; offset: number }> } | undefined {
  const entry = urlAttribute(tag, attr);
  const { start, end } = urlBounds(value);
  if (!entry || start === end) {
    return undefined;
  }
  return {
    use: entry.use,
    urls: entry.list ? srcsetUrls(value) : [{ url: value.slice(start, end), offset: start }],
  };
}

/** A URL without the C0 controls and spaces at its ends, which the URL parser strips. */
export function trimUrl(url: string): string {
  const { start, end } = urlBounds(url);
  return url.slice(start, end);
}

/** Where `value` starts and ends past the C0 controls and spaces; a no-break space stays. */
function urlBounds(value: string): { start: number; end: number } {
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) <= 0x20) {
    start++;
  }
  while (end > start && value.charCodeAt(end - 1) <= 0x20) {
    end--;
  }
  return { start, end };
}
