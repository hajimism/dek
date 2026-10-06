import { pptxDeck } from "../core/pptx.ts";
import type { DecksTarget } from "./scope.ts";

/** One file per deck, a single deck included, as `dekc pdf` answers. */
export type PptxCliResult = { outs: string[] };

export async function pptxCommand(
  { project, decks }: DecksTarget,
  options: { rootDist?: boolean; public?: boolean } = {},
): Promise<PptxCliResult> {
  const outs: string[] = [];
  for (const entry of decks) {
    const done = await pptxDeck(
      { project, deck: entry },
      { rootDist: options.rootDist, public: options.public },
    );
    outs.push(done.outPath);
  }
  return { outs };
}
