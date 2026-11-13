// Which slide of the article the reader is on, for the table of contents to mark.

/**
 * The slide whose heading is the last one at or above `line`, a distance from the top of the
 * window; none while the first heading is still below it. `headings` come in the article's order.
 */
export function readingSlug(
  headings: ReadonlyArray<{ slug: string; top: number }>,
  line: number,
): string | null {
  let reading: string | null = null;
  for (const heading of headings) {
    if (heading.top > line) {
      break;
    }
    reading = heading.slug;
  }
  return reading;
}
