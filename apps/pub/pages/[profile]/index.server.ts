import { defineHandler, defineHead, type InferProps } from "void";
import { env } from "void/env";
import { translate } from "../../src/lib/i18n.ts";
import { currentPerson } from "../../src/server/actor.ts";
import { handleOf } from "../../src/lib/profile-path.ts";
import { talkCards } from "../../src/server/pages.ts";
import { userByHandle } from "../../src/server/users.ts";

export type Props = InferProps<typeof loader>;

export const loader = defineHandler(async (c) => {
  const handle = handleOf(c.req.param("profile"));
  const account = handle ? await userByHandle(c, handle) : null;
  if (!account) {
    c.set("pageStatus", 404);
    return { profile: null };
  }
  const person = await currentPerson(c).catch(() => null);
  const isOwner = person?.id === account.id;
  const talks = await talkCards(c, account, { publicOnly: !isOwner });
  return {
    profile: {
      handle: account.handle,
      name: account.name,
      image: account.image,
      isOwner,
      talks,
      url: `${env.APP_ORIGIN}/@${account.handle}`,
    },
  };
});

export const head = defineHead<Props>((c, { profile }) => {
  const lang = c.get("shared").lang;
  if (!profile) {
    return { title: translate(lang, "404.title"), meta: [{ name: "robots", content: "noindex" }] };
  }
  const title = `${profile.name} (@${profile.handle})`;
  return {
    title,
    meta: [
      { property: "og:title", content: title },
      { property: "og:url", content: profile.url },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
    link: [
      { rel: "alternate", type: "application/rss+xml", title: `${profile.name} · dek.pub`, href: `${profile.url}/rss` },
      { rel: "canonical", href: profile.url },
    ],
  };
});
