import { buildDeck } from "../core/build.ts";
import { type Diagnostic, uniqueDiagnostics } from "../core/diagnostic.ts";
import { lintDeck } from "../core/lint.ts";
import { playerScript } from "../runtime/player.ts";
import { resolveDecks } from "./scope.ts";

/**
 * A build never fails on lint: at the venue, a deck that shows is better than
 * none. What lint would say comes back with it, so nobody ships it unaware.
 */
export type BuildCliResult = {
  /** One file per deck built, a single deck included, so the shape never depends on the scope. */
  outs: string[];
  diagnostics: Diagnostic[];
};

export async function buildCommand(options: {
  cwd: string;
  deck?: string;
  rootDist?: boolean;
}): Promise<BuildCliResult> {
  const { project, decks } = resolveDecks(options.cwd, { deck: options.deck });
  const script = await playerScript();
  const outs = await Promise.all(
    decks.map((entry) =>
      buildDeck({ project, deck: entry }, { playerScript: script, rootDist: options.rootDist }),
    ),
  ).then((results) => results.map((result) => result.outPath));
  const diagnostics = uniqueDiagnostics(
    decks.flatMap((entry) => lintDeck({ project, deck: entry })),
  );
  return { outs, diagnostics };
}
