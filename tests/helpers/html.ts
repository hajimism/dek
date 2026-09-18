export function normalizeHtml(html: string): string {
  return html.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
}

export function extractSlide(html: string): string {
  const match = html.match(/<section\b[^>]*\bslide\b[^>]*>[\s\S]*?<\/section>/);
  if (!match) {
    throw new Error('no <section class="slide"> found');
  }
  return normalizeHtml(match[0]);
}

export function slideDocument(sectionInner: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="../theme.css">
</head>
<body>
  ${sectionInner}
</body>
</html>
`;
}
