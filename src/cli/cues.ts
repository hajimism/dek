import { cuesFromDeck } from "../core/cue.ts";
import type { Diagnostic } from "../core/diagnostic.ts";
import { silentCueDiagnostics } from "../core/lint.ts";
import type { DeckTarget } from "./scope.ts";

export type CuesResult = {
  name: string;
  cues: ReturnType<typeof cuesFromDeck>;
  diagnostics: Diagnostic[];
};

export function cuesCommand({ deck }: DeckTarget): CuesResult {
  return {
    name: deck.name,
    cues: cuesFromDeck(deck.deck),
    diagnostics: silentCueDiagnostics(deck),
  };
}
