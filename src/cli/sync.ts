import { join } from "node:path";
import { syncDeck } from "../core/sync.ts";
import { ignoreLocalState } from "./files.ts";
import type { DecksTarget } from "./scope.ts";

/**
 * Every file the sync wrote or removed: the decks' slides, then dek's own files, then .gitignore
 * when it lacked what dek keeps for itself; and the slides it kept though their section is gone,
 * which lint reports as DEK002.
 */
export type SyncCliResult = {
  created: string[];
  updated: string[];
  removed: string[];
  kept: string[];
};

export function syncCommand({ project, decks }: DecksTarget): SyncCliResult {
  const result: SyncCliResult = { created: [], updated: [], removed: [], kept: [] };
  const dek = { created: [] as string[], updated: [] as string[] };
  for (const deck of decks) {
    const synced = syncDeck({ project, deck });
    result.created.push(...synced.created);
    result.updated.push(...synced.updated);
    result.removed.push(...synced.removed);
    result.kept.push(...synced.kept);
    // The first deck brings them up to date; the rest find them current.
    dek.created.push(...synced.dekFiles.created);
    dek.updated.push(...synced.dekFiles.updated);
  }
  result.created.push(...dek.created);
  result.updated.push(...dek.updated);
  if (ignoreLocalState(project.root)) {
    result.updated.push(join(project.root, ".gitignore"));
  }
  return result;
}
