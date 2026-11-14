import { defineHandler, defineHead, type InferProps } from "void";
import { env } from "void/env";
import { translate } from "../src/common/i18n.ts";
import { featuredTalk } from "../src/model/deck/card.server.ts";
import { talkPath } from "../src/model/deck/deck.ts";
import { langLinks, langUrl } from "../src/shell/lang-url.ts";

export type Props = InferProps<typeof loader>;

// The talk the landing page shows, so the page can point at a real one rather than describe it.
export const loader = defineHandler(async (c) => {
  const card = await featuredTalk(c, env.FEATURED_TALK);
  return {
    sample: card && {
      href: talkPath(card.owner.handle, card.slug),
      title: card.title,
      handle: card.owner.handle,
      picture: card.picture,
    },
  };
});

export const head = defineHead<Props>((c) => {
  const lang = c.get("shared").lang;
  return {
    title: translate(lang, "about.title"),
    meta: [
      { name: "description", content: translate(lang, "about.description") },
      { property: "og:title", content: translate(lang, "about.title") },
      { property: "og:description", content: translate(lang, "about.description") },
      { property: "og:url", content: langUrl(env.APP_ORIGIN, "/about", lang) },
      { property: "og:site_name", content: "dek.pub" },
      { name: "twitter:card", content: "summary" },
    ],
    link: langLinks(env.APP_ORIGIN, "/about", lang),
  };
});
