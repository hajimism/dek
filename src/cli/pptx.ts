import { type PptxLifted, pptxDeck } from "../core/pptx.ts";
import type { DecksTarget } from "./scope.ts";

/**
 * One file per deck, a single deck included, as `dekc pdf` answers; with `--shapes`, what each
 * file laid over its pictures, for the text output alone (`--json` is `outs`).
 */
export type PptxCliResult = { outs: string[]; lifted?: PptxLifted[] };

export async function pptxCommand(
  { project, decks }: DecksTarget,
  options: { rootDist?: boolean; public?: boolean; shapes?: boolean } = {},
): Promise<PptxCliResult> {
  const outs: string[] = [];
  const lifted: PptxLifted[] = [];
  for (const entry of decks) {
    const done = await pptxDeck(
      { project, deck: entry },
      { rootDist: options.rootDist, public: options.public, shapes: options.shapes },
    );
    outs.push(done.outPath);
    if (done.lifted) {
      lifted.push(done.lifted);
    }
  }
  return options.shapes ? { outs, lifted } : { outs };
}
