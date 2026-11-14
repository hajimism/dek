// A person's profile: who they are and one page of their talks, all of them for the person
// themself, the public ones for anyone else. The page asks for the next pages as the reader wants
// them, through `talkPageOf` too. A page past the last is as missing as a person who is not. And
// the feed of their public talks.

import type { Context } from "hono";
import type { TalkPage } from "../../../../../../../src/pub/protocol.ts";
import { appUrl } from "../../../../common/http.server.ts";
import { talkCount, talksBy } from "../../../deck/card.server.ts";
import { viewerOf } from "../../actor.server.ts";
import { handleOf } from "../../profile-path.ts";
import { personByHandle } from "../../store.server.ts";
import type { Person } from "../../type.ts";
import { pageCount, profileHref, TALKS_PER_PAGE } from "./paging.ts";
import { talkFeed } from "./rss.ts";
import type { ProfilePage } from "./type.ts";

/** The person a profile's address names, as `@handle`; null for anything else. */
async function ownerOf(c: Context, segment: string | undefined): Promise<Person | null> {
  const handle = handleOf(segment);
  return handle ? personByHandle(c, handle) : null;
}

/** Page `page` of `person`'s talks as whoever asks may see them, or null past the last page. */
export async function talkPageOf(
  c: Context,
  person: Person,
  page: number,
): Promise<(TalkPage & { isOwner: boolean }) | null> {
  const isOwner = (await viewerOf(c))?.id === person.id;
  const total = await talkCount(person, { publicOnly: !isOwner });
  if (page > pageCount(total)) {
    return null;
  }
  const talks = await talksBy(c, person, {
    publicOnly: !isOwner,
    limit: TALKS_PER_PAGE,
    offset: (page - 1) * TALKS_PER_PAGE,
  });
  return { talks, total, isOwner };
}

export async function loadProfile(
  c: Context,
  segment: string | undefined,
  page: number,
): Promise<ProfilePage | null> {
  const person = await ownerOf(c, segment);
  const talks = person ? await talkPageOf(c, person, page) : null;
  if (!person || !talks) {
    return null;
  }
  return {
    handle: person.handle,
    name: person.name,
    image: person.image,
    ...talks,
    page,
    url: appUrl(profileHref(person.handle, "gallery", page)),
  };
}

/** The RSS feed of a person's public talks, the newest 50; null for an address that names no one. */
export async function loadFeed(c: Context, segment: string | undefined): Promise<string | null> {
  const person = await ownerOf(c, segment);
  if (!person) {
    return null;
  }
  return talkFeed(person, await talksBy(c, person, { publicOnly: true, limit: 50 }), appUrl(""));
}
