/** The candidate within two edits of `word` (transpositions count as one), closest first. */
export function suggest(word: string, candidates: string[]): string | undefined {
  let best: { name: string; distance: number } | undefined;
  for (const name of candidates) {
    const distance = editDistance(word, name);
    if (distance <= 2 && (!best || distance < best.distance)) {
      best = { name, distance };
    }
  }
  return best?.name;
}

/** Optimal string alignment distance: insertions, deletions, substitutions, adjacent swaps. */
function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  const at = (i: number, j: number): number => rows[i]?.[j] ?? Number.POSITIVE_INFINITY;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, at(i - 2, j - 2) + 1);
      }
      const row = rows[i];
      if (row) {
        row[j] = value;
      }
    }
  }
  return at(a.length, b.length);
}
