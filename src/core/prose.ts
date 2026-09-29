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
