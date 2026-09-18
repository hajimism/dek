import { cuesFromDeck } from "../core/cue.ts";
import { requireDeckFromCwd } from "./scope.ts";

export type CuesResult = {
  name: string;
  cues: ReturnType<typeof cuesFromDeck>;
};

export function cuesCommand(options: { cwd: string; deck?: string }): CuesResult {
  const { deck } = requireDeckFromCwd(options.cwd, options.deck);
  return {
    name: deck.name,
    cues: cuesFromDeck(deck.deck),
  };
}
