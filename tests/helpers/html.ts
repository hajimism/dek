function normalizeHtml(html: string): string {
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

export type StampedPlace = { slug: string; number?: number; count?: number };

/**
 * Each slide on a page with the place dekc stamped on it, in page order. Only sections that carry
 * a `data-slug` count: a theme's examples, quoted in its CSS, are not slides.
 */
export function slidePlaces(html: string): StampedPlace[] {
  return [...html.matchAll(/<section\b[^>]*\bdata-slug="([^"]*)"[^>]*>/g)].map(
    ([tag, slug = ""]) => {
      const number = tag.match(/--dekc-slide-number:\s*(\d+)/)?.[1];
      const count = tag.match(/--dekc-slide-count:\s*(\d+)/)?.[1];
      return {
        slug,
        ...(number ? { number: Number(number) } : {}),
        ...(count ? { count: Number(count) } : {}),
      };
    },
  );
}
