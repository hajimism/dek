// What the talk page loads: the deck in its frame, the script, the comments this person may read
// and the owner's other talks. A talk someone may not see loads as a missing one, so its page
// cannot tell the two apart.

import type { Context } from "hono";
import { ApiError } from "../../../../common/api-error.ts";
import { appUrl } from "../../../../common/http.server.ts";
import { guessLang, type Lang } from "../../../../common/i18n.ts";
import { canReadComments } from "../../../comment/access.ts";
import { isMuted } from "../../../comment/mute.server.ts";
import { canPostPublic, publicCommentsOn } from "../../../comment/public/access.ts";
import { publicCommentsOf } from "../../../comment/public/store.server.ts";
import { commentsFor } from "../../../comment/store.server.ts";
import { viewerOf } from "../../../person/actor.server.ts";
import { profileOf } from "../../../person/person.ts";
import { handleOf } from "../../../person/profile-path.ts";
import { personByHandle } from "../../../person/store.server.ts";
import { canComment, canManage, canSeeScript } from "../../access.ts";
import { talksBy } from "../../card.server.ts";
import { talkPath } from "../../deck.ts";
import { likeState } from "../../like/store.server.ts";
import { deckBySlug, visibleDeck } from "../../store.server.ts";
import { findVersion } from "../../version/store.server.ts";
import { coverOf, slidePicture } from "../../version/version.ts";
import { frameOf } from "./frame.server.ts";
import type { Talk } from "./type.ts";

export async function loadTalk(
  c: Context,
  segment: string | undefined,
  slug: string | undefined,
): Promise<Talk | null> {
  const handle = handleOf(segment);
  const owner = handle ? await personByHandle(c, handle) : null;
  const row = owner && slug ? await deckBySlug(owner.id, slug) : null;
  if (!owner || !row || row.currentVersion === null) {
    return null;
  }
  const person = await viewerOf(c);
  const seen = await visibleDeck(row.id, person).catch((error: unknown) => {
    if (error instanceof ApiError) {
      return null;
    }
    throw error;
  });
  if (!seen) {
    return null;
  }
  const { deck, grant, side } = seen;
  const n = deck.currentVersion;
  const version = n === null ? null : await findVersion(deck.id, n);
  if (n === null || !version) {
    return null;
  }
  const slides = version.slideMap.slides;
  const isOwner = canManage(deck, person);
  const script = deck.scriptPublic ? "public" : isOwner ? "owner" : "hidden";
  const picture = coverOf(deck.id, version);

  const readsComments = canReadComments(deck, person, grant);
  return {
    id: deck.id,
    slug: deck.slug,
    title: deck.title,
    description: deck.description,
    event: deck.event,
    date: deck.talkDate,
    minutes: deck.minutes,
    lang:
      deck.lang ??
      guessLang(
        [deck.title, ...slides.flatMap((slide) => [slide.title, ...slide.paragraphs])],
        (c.get("shared") as { lang?: Lang } | undefined)?.lang,
      ),
    visibility: deck.visibility,
    scriptPublic: deck.scriptPublic,
    commentPolicy: deck.comments,
    url: appUrl(talkPath(owner.handle, deck.slug)),
    owner: profileOf(owner),
    version: n,
    viewer: await frameOf(deck, n),
    slides: slides.map((slide) => ({
      slug: slide.slug,
      title: slide.title,
      steps: slide.steps.map((step) => step.step),
      paragraphs: canSeeScript(deck, person) ? slide.paragraphs : null,
      picture: version.shots[slide.slug] ? slidePicture(deck.id, n, slide.slug) : null,
    })),
    script,
    isOwner,
    comments: readsComments ? await commentsFor(c, deck, person, side, "all") : null,
    canComment: canComment(deck, person, grant),
    muted: person && readsComments ? await isMuted(person.id, deck.id) : null,
    publicComments: publicCommentsOn(deck) ? await publicCommentsOf(c, deck.id) : null,
    canPostPublic: canPostPublic(deck, person),
    likes: publicCommentsOn(deck) ? await likeState(deck.id, person?.id ?? null) : null,
    side,
    image: picture ? appUrl(picture) : null,
    more: (await talksBy(c, owner, { publicOnly: true, limit: 4 }))
      .filter((card) => card.slug !== deck.slug)
      .slice(0, 3),
  };
}
