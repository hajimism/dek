// Public comments as a talk lists them: oldest first, each reply under the comment it answers.

/** Top-level comments oldest first, each with its replies oldest first; a reply to none is left out. */
export function threadPublic<T extends { id: string; parentId: string | null; createdAt: string }>(
  rows: readonly T[],
): Array<T & { replies: T[] }> {
  const byTime = [...rows].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  const tops = byTime
    .filter((row) => row.parentId === null)
    .map((row) => ({ ...row, replies: [] as T[] }));
  const byId = new Map(tops.map((top) => [top.id, top]));
  for (const row of byTime) {
    if (row.parentId !== null) {
      byId.get(row.parentId)?.replies.push(row);
    }
  }
  return tops;
}
