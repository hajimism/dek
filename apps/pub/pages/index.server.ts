import { defineHandler, defineHead, type InferProps } from "void";
import { env } from "void/env";
import { translate } from "../src/common/i18n.ts";
import { featuredTalk, recentPublicTalks } from "../src/model/deck/card.server.ts";
import { langLinks, langUrl } from "../src/shell/lang-url.ts";

export type Props = InferProps<typeof loader>;

export const loader = defineHandler(async (c) => {
  const [talks, featured] = await Promise.all([
    recentPublicTalks(c, 9),
    featuredTalk(c, env.FEATURED_TALK),
  ]);
  return { talks, featured };
});

export const head = defineHead<Props>((c) => {
  const lang = c.get("shared").lang;
  return {
    title: translate(lang, "site.tagline"),
    meta: [
      { name: "description", content: translate(lang, "site.description") },
      { property: "og:title", content: "dek.pub" },
      { property: "og:description", content: translate(lang, "site.description") },
      { property: "og:url", content: langUrl(env.APP_ORIGIN, "/", lang) },
      { property: "og:site_name", content: "dek.pub" },
      { name: "twitter:card", content: "summary" },
    ],
    link: langLinks(env.APP_ORIGIN, "/", lang),
  };
});
