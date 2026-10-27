/**
 * Orders two strings by their UTF-16 code units, as `Array.prototype.sort` does with no
 * comparator, so every list dek sorts comes out in one order, the same on every machine.
 *
 * `localeCompare` with no locale follows the machine's, so a teammate set to Swedish or Turkish
 * would write dict.toml in another order. A fixed locale is no cure: its collation comes from
 * the ICU the runtime has, which Bun takes from the system on macOS and bundles on Linux, and it
 * counts a precomposed `ä` and an `a` with a combining mark as equal, leaving their order to
 * whichever came first. Code units cost a dictionary's order: `B` comes before `a`, `ä` after
 * `z`, and Japanese reads hiragana, then katakana, then kanji by code point.
 */
export function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
