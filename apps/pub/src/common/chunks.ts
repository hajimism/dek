// D1 binds at most 100 values to one statement, so a long list of IDs is asked for in parts.

/** How many IDs one query asks for, leaving room under D1's 100 for the other values it binds. */
export const IDS_PER_QUERY = 90;

/** `items` in order, in runs of at most `size`; none when there are none. */
export function chunks<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`a chunk holds at least one item, not ${size}`);
  }
  const runs: T[][] = [];
  for (let at = 0; at < items.length; at += size) {
    runs.push(items.slice(at, at + size));
  }
  return runs;
}
