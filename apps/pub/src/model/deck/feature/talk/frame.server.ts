// The frame the talk page shows a deck in: the deck's own origin, and for any build that is not
// open to anyone, a token for this deck, version and build, good for minutes.

import { env } from "void/env";
import { accessOf, isOpen, readerVariant } from "../../serving/access-file.ts";
import { deckOrigin } from "../../serving/origin.ts";
import { signServeToken } from "../../serving/serve-token.ts";
import type { Deck } from "../../type.ts";

const TOKEN_SECONDS = 10 * 60;

export async function frameOf(deck: Deck, n: number): Promise<{ src: string; origin: string }> {
  const origin = deckOrigin(env.DECK_ORIGIN, deck.id);
  const src = `${origin}/v/${n}/`;
  if (isOpen(accessOf(deck), n)) {
    return { src, origin };
  }
  const token = await signServeToken(env.SERVE_TOKEN_SECRET, {
    deck: deck.id,
    n,
    variant: readerVariant(deck.scriptPublic),
    exp: Math.floor(Date.now() / 1000) + TOKEN_SECONDS,
  });
  return { src: `${src}?t=${encodeURIComponent(token)}`, origin };
}
