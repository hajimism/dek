// What the owner's dashboard of a deck loads. Anyone else gets null, as for a missing deck.

import type { Context } from "hono";
import type { DeckStatus } from "../../../../../../../src/pub/protocol.ts";
import { viewerOf } from "../../../person/actor.server.ts";
import { handleOf } from "../../../person/profile-path.ts";
import { grantList } from "../../grant/store.server.ts";
import type { GrantView } from "../../grant/type.ts";
import { deckBySlug, deckStatus } from "../../store.server.ts";

export async function loadManage(
  c: Context,
  segment: string | undefined,
  slug: string | undefined,
): Promise<{ status: DeckStatus; grants: GrantView[] } | null> {
  const handle = handleOf(segment);
  const person = await viewerOf(c);
  if (!handle || !slug || person?.handle !== handle) {
    return null;
  }
  const deck = await deckBySlug(person.id, slug);
  return deck ? { status: await deckStatus(c, deck), grants: await grantList(c, deck.id) } : null;
}
