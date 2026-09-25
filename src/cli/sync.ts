import { type SyncResult, syncDeck } from "../core/index.ts";
import { resolveDecks } from "./scope.ts";

export type SyncCliResult = SyncResult;

export function syncCommand(options: { cwd: string; deck?: string }): SyncCliResult {
  const { project, decks } = resolveDecks(options.cwd, { deck: options.deck });
  const result: SyncCliResult = { created: [], updated: [], removed: [] };
  for (const deck of decks) {
    const synced = syncDeck({ project, deck });
    result.created.push(...synced.created);
    result.updated.push(...synced.updated);
    result.removed.push(...synced.removed);
  }
  return result;
}
