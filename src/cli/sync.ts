import { join } from "node:path";
import { syncDeck } from "../core/sync.ts";
import { ignoreLocalState } from "./files.ts";
import type { DecksTarget } from "./scope.ts";

/**
 * Every file the sync wrote or removed: the decks' slides, then dekc's own files, then .gitignore
 * when it lacked what dekc keeps for itself; and the slides it kept though their section is gone,
 * which lint reports as DEKC002.
 */
export type SyncCliResult = {
  created: string[];
  updated: string[];
  removed: string[];
  kept: string[];
};

export function syncCommand({ project, decks }: DecksTarget): SyncCliResult {
  const result: SyncCliResult = { created: [], updated: [], removed: [], kept: [] };
  const dekc = { created: [] as string[], updated: [] as string[] };
  for (const deck of decks) {
    const synced = syncDeck({ project, deck });
    result.created.push(...synced.created);
    result.updated.push(...synced.updated);
    result.removed.push(...synced.removed);
    result.kept.push(...synced.kept);
    // The first deck brings them up to date; the rest find them current.
    dekc.created.push(...synced.dekcFiles.created);
    dekc.updated.push(...synced.dekcFiles.updated);
  }
  result.created.push(...dekc.created);
  result.updated.push(...dekc.updated);
  if (ignoreLocalState(project.root)) {
    result.updated.push(join(project.root, ".gitignore"));
  }
  return result;
}
