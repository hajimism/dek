import { type SyncResult, syncDeck } from "../core/sync.ts";
import type { DecksTarget } from "./scope.ts";

export type SyncCliResult = SyncResult;

export function syncCommand({ project, decks }: DecksTarget): SyncCliResult {
  const result: SyncCliResult = { created: [], updated: [], removed: [] };
  for (const deck of decks) {
    const synced = syncDeck({ project, deck });
    result.created.push(...synced.created);
    result.updated.push(...synced.updated);
    result.removed.push(...synced.removed);
  }
  return result;
}
