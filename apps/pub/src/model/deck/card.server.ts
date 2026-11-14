// Talks as lists show them. A card is the version readers see, so a deck with none has no card.

import type { Context } from "hono";
import { profileOf } from "../person/person.ts";
import { handleOf } from "../person/profile-path.ts";
import { peopleById, personByHandle } from "../person/store.server.ts";
import type { Person } from "../person/type.ts";
import { talkNamed } from "./deck.ts";
import { deckCount, decksOf, recentPublicDecks } from "./store.server.ts";
import type { Deck, TalkCard } from "./type.ts";
import { currentVersionOf } from "./version/store.server.ts";
import { coverOf } from "./version/version.ts";

async function cardsOf(
  c: Context,
  rows: readonly Deck[],
  owners?: Map<string, Person>,
): Promise<TalkCard[]> {
  const people =
    owners ??
    (await peopleById(
      c,
      rows.map((row) => row.ownerId),
    ));
  const versions = await Promise.all(
    rows.map((row) => (people.has(row.ownerId) ? currentVersionOf(row) : null)),
  );
  return rows.flatMap((row, i) => {
    const owner = people.get(row.ownerId);
    const version = versions[i];
    if (!owner || !version) {
      return [];
    }
    return [
      {
        slug: row.slug,
        title: row.title,
        event: row.event,
        date: row.talkDate,
        slides: version.slideMap.slides.length,
        visibility: row.visibility,
        picture: coverOf(row.id, version),
        owner: profileOf(owner),
        updatedAt: row.updatedAt,
      },
    ];
  });
}

/** A person's talks, newest first; only the public ones unless `publicOnly` is false. */
export async function talksBy(
  c: Context,
  person: Person,
  options: { publicOnly: boolean; limit?: number; offset?: number },
): Promise<TalkCard[]> {
  return cardsOf(c, await decksOf(person.id, options), new Map([[person.id, person]]));
}

/** How many talks talksBy has for a person, all pages together. */
export async function talkCount(person: Person, options: { publicOnly: boolean }): Promise<number> {
  return deckCount(person.id, options);
}

export async function recentPublicTalks(c: Context, limit: number): Promise<TalkCard[]> {
  return cardsOf(c, await recentPublicDecks(limit));
}

/**
 * The talk the landing page shows as a sample, named by FEATURED_TALK as `@handle/slug`: chosen by
 * whoever runs the site, never just the newest talk, and only while it is public.
 */
export async function featuredTalk(c: Context, name: string): Promise<TalkCard | null> {
  const named = talkNamed(name);
  const handle = named ? handleOf(named.segment) : null;
  const person = handle ? await personByHandle(c, handle) : null;
  if (!named || !person) {
    return null;
  }
  const cards = await talksBy(c, person, { publicOnly: true });
  return cards.find((card) => card.slug === named.slug) ?? null;
}
