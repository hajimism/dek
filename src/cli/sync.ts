import { join } from "node:path";
import { type PluginSync, syncPlugins } from "../core/plugin-host.ts";
import { syncDeck } from "../core/sync.ts";
import { ignoreLocalState } from "./files.ts";
import type { DecksTarget } from "./scope.ts";

/**
 * Every file the sync wrote or removed: the plugins' locks, the decks' slides, then dek's own
 * files, then .gitignore when it lacked what dek keeps for itself; the slides it kept though their
 * section is gone, which lint reports as DEK002; and what it did with each plugin dek.toml names.
 */
export type SyncCliResult = {
  created: string[];
  updated: string[];
  removed: string[];
  kept: string[];
  plugins?: PluginSync[];
};

/**
 * `accept` names a plugin whose changed manifest to pin anyway. The plugins go first, so the
 * AGENTS.md the decks' sync writes lists them as they now stand.
 */
export async function syncCommand(
  { project, decks }: DecksTarget,
  options: { accept?: string } = {},
): Promise<SyncCliResult> {
  const plugins = await syncPlugins(project, options);
  const result: SyncCliResult = {
    created: [...plugins.created],
    updated: [...plugins.updated],
    removed: [],
    kept: [],
  };
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
  return plugins.plugins.length > 0 ? { ...result, plugins: plugins.plugins } : result;
}
