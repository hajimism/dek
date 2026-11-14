// A person's profile: who they are and one page of their talks, all of them for the person
// themself, the public ones for anyone else. The page asks for the next pages as the reader wants
// them, through `talkPageOf` too. A page past the last is as missing as a person who is not.

import type { Context } from "hono";
import type { TalkPage } from "../../../../../../../src/pub/protocol.ts";
import { appUrl } from "../../../../common/http.server.ts";
import { talkCount, talksBy } from "../../../deck/card.server.ts";
import { viewerOf } from "../../actor.server.ts";
import { handleOf } from "../../profile-path.ts";
import { personByHandle, signsInWithGitHub } from "../../store.server.ts";
import type { Person } from "../../type.ts";
import { pageCount, profileHref, TALKS_PER_PAGE } from "./paging.ts";
import type { ProfilePage } from "./type.ts";

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
  const handle = handleOf(segment);
  const person = handle ? await personByHandle(c, handle) : null;
  const talks = person ? await talkPageOf(c, person, page) : null;
  if (!person || !talks) {
    return null;
  }
  return {
    handle: person.handle,
    name: person.name,
    image: person.image,
    github: await signsInWithGitHub(c, person),
    ...talks,
    page,
    url: appUrl(profileHref(person.handle, "gallery", page)),
  };
}
