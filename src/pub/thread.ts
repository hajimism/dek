// How people name a review thread on dek.pub: by its number in its scope, a team thread's with a T
// before it. Without zod, so the pages can show it and the CLI can read it back.

import type { CommentRow, ThreadScope } from "./protocol.ts";

/** A thread's number as people say it: `T3` for a team thread, `3` for a shared one. */
export function threadLabel(row: Pick<CommentRow, "number" | "scope">): string {
  return row.scope === "team" ? `T${row.number}` : String(row.number);
}

/** The thread a label names, `3`, `#3`, `T3` or `t3`; null for a word that is not one. */
export function threadOfLabel(word: string): { number: number; scope: ThreadScope } | null {
  const match = /^#?(t?)(\d+)$/i.exec(word);
  if (!match) {
    return null;
  }
  return { number: Number(match[2]), scope: match[1] ? "team" : "shared" };
}
