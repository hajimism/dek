import { buildDeck } from "../core/build.ts";
import { playerScript } from "../runtime/player.ts";
import { resolveDecks } from "./scope.ts";

export type BuildCliResult = { out: string } | { outs: string[] };

export async function buildCommand(options: {
  cwd: string;
  deck?: string;
  rootDist?: boolean;
}): Promise<BuildCliResult> {
  const { project, deck, decks } = resolveDecks(options.cwd, { deck: options.deck });
  const script = await playerScript();
  const outs = await Promise.all(
    decks.map((entry) =>
      buildDeck({ project, deck: entry }, { playerScript: script, rootDist: options.rootDist }),
    ),
  ).then((results) => results.map((result) => result.outPath));
  if (deck && outs[0]) {
    return { out: outs[0] };
  }
  return { outs };
}
