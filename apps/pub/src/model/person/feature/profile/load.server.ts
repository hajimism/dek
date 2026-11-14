// A person's profile: who they are and their talks, all of them for the person themself, the
// public ones for anyone else; and the feed of their public talks.

import type { Context } from "hono";
import { appUrl } from "../../../../common/http.server.ts";
import { talksBy } from "../../../deck/card.server.ts";
import { viewerOf } from "../../actor.server.ts";
import { handleOf, profilePath } from "../../profile-path.ts";
import { personByHandle } from "../../store.server.ts";
import type { Person } from "../../type.ts";
import { talkFeed } from "./rss.ts";
import type { ProfilePage } from "./type.ts";

/** The person a profile's address names, as `@handle`; null for anything else. */
async function ownerOf(c: Context, segment: string | undefined): Promise<Person | null> {
  const handle = handleOf(segment);
  return handle ? personByHandle(c, handle) : null;
}

export async function loadProfile(
  c: Context,
  segment: string | undefined,
): Promise<ProfilePage | null> {
  const person = await ownerOf(c, segment);
  if (!person) {
    return null;
  }
  const isOwner = (await viewerOf(c))?.id === person.id;
  return {
    handle: person.handle,
    name: person.name,
    image: person.image,
    isOwner,
    talks: await talksBy(c, person, { publicOnly: !isOwner }),
    url: appUrl(profilePath(person.handle)),
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
