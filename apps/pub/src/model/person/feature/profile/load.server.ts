// A person's profile: who they are and their talks, all of them for the person themself, the
// public ones for anyone else.

import type { Context } from "hono";
import { appUrl } from "../../../../common/http.server.ts";
import { talksBy } from "../../../deck/card.server.ts";
import { viewerOf } from "../../actor.server.ts";
import { handleOf, profilePath } from "../../profile-path.ts";
import { personByHandle, signsInWithGitHub } from "../../store.server.ts";
import type { ProfilePage } from "./type.ts";

export async function loadProfile(
  c: Context,
  segment: string | undefined,
): Promise<ProfilePage | null> {
  const handle = handleOf(segment);
  const person = handle ? await personByHandle(c, handle) : null;
  if (!person) {
    return null;
  }
  const isOwner = (await viewerOf(c))?.id === person.id;
  return {
    handle: person.handle,
    name: person.name,
    image: person.image,
    github: await signsInWithGitHub(c, person),
    isOwner,
    talks: await talksBy(c, person, { publicOnly: !isOwner }),
    url: appUrl(profilePath(person.handle)),
  };
}
