// What a feed may carry: XML 1.0 refuses most control characters outright, so they are dropped,
// and an item whose date does not parse goes without one rather than with "Invalid Date".

function allowedInXml(code: number): boolean {
  return (
    code === 0x9 ||
    code === 0xa ||
    code === 0xd ||
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0x10ffff)
  );
}

/** Text as an XML element or attribute may hold it. */
export function xmlText(text: string): string {
  let kept = "";
  for (const char of text) {
    if (allowedInXml(char.codePointAt(0) ?? 0)) {
      kept += char;
    }
  }
  return kept
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** RFC 822 as RSS 2.0 wants it, from a talk's date or else when it was updated; null if neither parses. */
export function rssDate(date: string | null, fallback: string): string | null {
  for (const value of [
    date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00Z` : date,
    fallback,
  ]) {
    if (!value) {
      continue;
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toUTCString();
    }
  }
  return null;
}
