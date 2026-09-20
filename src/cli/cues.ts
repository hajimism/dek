import { cuesFromDeck } from "../core/cue.ts";
import type { Diagnostic } from "../core/diagnostic.ts";
import { silentCueDiagnostics } from "../core/lint.ts";
import { requireDeckFromCwd } from "./scope.ts";

export type CuesResult = {
  name: string;
  cues: ReturnType<typeof cuesFromDeck>;
  diagnostics: Diagnostic[];
};

export function cuesCommand(options: { cwd: string; deck?: string }): CuesResult {
  const { deck } = requireDeckFromCwd(options.cwd, options.deck);
  return {
    name: deck.name,
    cues: cuesFromDeck(deck.deck),
    diagnostics: silentCueDiagnostics(deck),
  };
}
