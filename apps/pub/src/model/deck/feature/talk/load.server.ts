// What the talk page loads: the deck in its frame, the script, the comments this person may read
// and the owner's other talks. A talk someone may not see, a `link` one asked for without its key
// included, loads as a missing one, so its page cannot tell the two apart.

import type { Context } from "hono";
import { appUrl } from "../../../../common/http.server.ts";
import { guessLang, type Lang } from "../../../../common/i18n.ts";
import { canReadComments } from "../../../comment/access.ts";
import { isMuted } from "../../../comment/mute.server.ts";
import { commentsFor } from "../../../comment/store.server.ts";
import { viewerOf } from "../../../person/actor.server.ts";
import { profileOf } from "../../../person/person.ts";
import { handleOf } from "../../../person/profile-path.ts";
import { personByHandle } from "../../../person/store.server.ts";
import { canComment, canManage, canSeeScript, opensWithoutGrant } from "../../access.ts";
import { talksBy } from "../../card.server.ts";
import { keyed, linkKeyOf, talkHref, talkPath } from "../../deck.ts";
import { likeState } from "../../like/store.server.ts";
import { canPostPublic } from "../../public-comment/access.ts";
import { publicCommentsOf } from "../../public-comment/store.server.ts";
import { deckBySlug, requestKey, standingWith } from "../../store.server.ts";
import { currentVersionOf } from "../../version/store.server.ts";
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
  const deck = owner && slug ? await deckBySlug(owner.id, slug) : null;
  if (!owner || !deck || deck.currentVersion === null) {
    return null;
  }
  const person = await viewerOf(c);
  const standing = await standingWith(deck, person, requestKey(c));
  const version = standing && (await currentVersionOf(deck));
  if (!standing || !version) {
    return null;
  }
  const { role, side } = standing;
  const { n } = version;
  const slides = version.slideMap.slides;
  const isOwner = canManage(deck, person);
  const seesScript = canSeeScript(deck, person);
  const readsComments = canReadComments(deck, person, role);
  const open = opensWithoutGrant(deck);
  const key = linkKeyOf(deck);
  const picture = coverOf(deck.id, version);

  const [viewer, comments, muted, publicComments, likes, more] = await Promise.all([
    frameOf(deck, n),
    readsComments ? commentsFor(c, deck, person, side, "all") : null,
    person && readsComments ? isMuted(person.id, deck.id) : null,
    open ? publicCommentsOf(c, deck.id) : null,
    open ? likeState(deck.id, person?.id ?? null) : null,
    talksBy(c, owner, { publicOnly: true, limit: 4 }),
  ]);
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
    url: appUrl(talkHref(owner.handle, deck)),
    canonical: appUrl(talkPath(owner.handle, deck.slug)),
    key,
    owner: profileOf(owner),
    version: n,
    viewer,
    slides: slides.map((slide) => ({
      slug: slide.slug,
      title: slide.title,
      steps: slide.steps.map((step) => step.step),
      paragraphs: seesScript ? slide.paragraphs : null,
      picture: version.shots[slide.slug] ? keyed(slidePicture(deck.id, n, slide.slug), key) : null,
    })),
    script: deck.scriptPublic ? "public" : seesScript ? "owner" : "hidden",
    isOwner,
    comments,
    canComment: canComment(deck, person, role),
    muted,
    publicComments,
    canPostPublic: canPostPublic(deck, person),
    likes,
    side,
    image: picture ? appUrl(keyed(picture, key)) : null,
    more: more.filter((card) => card.slug !== deck.slug).slice(0, 3),
  };
}
