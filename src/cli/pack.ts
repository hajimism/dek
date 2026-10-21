import { writePack } from "../core/pack.ts";
import type { DecksTarget } from "./scope.ts";

/** One file per deck, a single deck included, as `dekc pdf` answers, and what to fix first. */
export type PackCliResult = { outs: string[]; warnings: string[] };

export async function packCommand(
  { project, decks }: DecksTarget,
  options: { rootDist?: boolean } = {},
): Promise<PackCliResult> {
  const outs: string[] = [];
  const warnings = new Set<string>();
  for (const entry of decks) {
    const done = await writePack(project, entry, { rootDist: options.rootDist });
    outs.push(done.outPath);
    for (const warning of done.warnings) {
      warnings.add(warning);
    }
  }
  return { outs, warnings: [...warnings] };
}
