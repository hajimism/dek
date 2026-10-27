/** "a", "a and b", "a, b, and c". */
export function listed(items: string[]): string {
  return joined(items, "and");
}

/** "a", "a or b", "a, b, or c". */
export function either(items: string[]): string {
  return joined(items, "or");
}

function joined(items: string[], conjunction: string): string {
  if (items.length <= 2) {
    return items.join(` ${conjunction} `);
  }
  return `${items.slice(0, -1).join(", ")}, ${conjunction} ${items.at(-1)}`;
}

/**
 * Names from someone else's files as a hint lists them: those `shows` passes, then how many others
 * there are, in the words of `others`. An other could hold anything, and an agent takes a hint as
 * dek's own words.
 */
export function listShown(
  names: string[],
  shows: (name: string) => boolean,
  others: (count: number) => string,
): string {
  const shown = names.filter(shows);
  const left = names.length - shown.length;
  if (left === 0) {
    return shown.join(", ");
  }
  return shown.length === 0 ? others(left) : `${shown.join(", ")}, and ${others(left)}`;
}

/** How many names a list leaves out because they are no plain word: see `listShown`. */
export function unprinted(count: number): string {
  return `${count} whose ${count === 1 ? "name" : "names"} dek does not print`;
}
