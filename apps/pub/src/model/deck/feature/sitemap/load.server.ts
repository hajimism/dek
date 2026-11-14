// The sitemap as dek.pub answers it, from the public decks and their owners in D1.

import type { Context } from "hono";
import { peopleById } from "../../../person/store.server.ts";
import { indexedDecks } from "../../store.server.ts";
import { SITEMAP_BOUND, type SitemapTalk, sitemapOf } from "./sitemap.ts";

export async function sitemapText(c: Context, origin: string): Promise<string> {
  const rows = await indexedDecks(SITEMAP_BOUND);
  const owners = await peopleById(
    c,
    rows.map((row) => row.ownerId),
  );
  const talks: SitemapTalk[] = rows.flatMap((row) => {
    const owner = owners.get(row.ownerId);
    return owner ? [{ handle: owner.handle, slug: row.slug, updatedAt: row.updatedAt }] : [];
  });
  return sitemapOf(origin, talks);
}
