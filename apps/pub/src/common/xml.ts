// Text in XML. XML 1.0 refuses most control characters outright, so they are dropped.

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
