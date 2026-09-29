export function splitLines(source: string): string[] {
  return source.split(/\r?\n/);
}

export function joinLines(source: string, lines: string[]): string {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  return lines.join(newline);
}

/**
 * The lines of each section, as script.md has them: from its heading up to the next section's,
 * the last one to the end. `lines` is the whole file and `starts` the 1-based heading lines, in
 * order.
 */
export function sectionChunks(lines: string[], starts: number[]): string[][] {
  return starts.map((start, index) =>
    lines.slice(start - 1, (starts[index + 1] ?? lines.length + 1) - 1),
  );
}

/** Where an offset into a source is written: 1-based line, and 1-based column in UTF-16 units. */
export type LineColumn = { line: number; column: number };

/** Turns offsets into `source` into lines and columns, from one pass over its newlines. */
export function lineLocator(source: string): (offset: number) => LineColumn {
  const starts = [0];
  for (let index = source.indexOf("\n"); index !== -1; index = source.indexOf("\n", index + 1)) {
    starts.push(index + 1);
  }
  return (offset) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if ((starts[mid] ?? 0) <= offset) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return { line: low + 1, column: offset - (starts[low] ?? 0) + 1 };
  };
}
