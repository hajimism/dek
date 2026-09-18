import { syncDeck } from "../core/index.ts";
import { resolveDecks } from "./scope.ts";

export type SyncCliResult = {
  created: string[];
};

export function syncCommand(options: { cwd: string; deck?: string }): SyncCliResult {
  const { project, decks } = resolveDecks(options.cwd, { deck: options.deck });
  const created: string[] = [];
  for (const deck of decks) {
    created.push(...syncDeck({ project, deck }).created);
  }
  return { created };
}
