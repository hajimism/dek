import { defineHandler, defineHead, type InferProps } from "void";
import { env } from "void/env";
import { translate } from "../src/lib/i18n.ts";
import { recentPublicTalks } from "../src/server/pages.ts";

export type Props = InferProps<typeof loader>;

export const loader = defineHandler(async (c) => {
  const talks = await recentPublicTalks(c, 9);
  return { talks };
});

export const head = defineHead<Props>((c) => {
  const lang = c.get("shared").lang;
  return {
    title: translate(lang, "site.tagline"),
    meta: [
      { name: "description", content: translate(lang, "site.description") },
      { property: "og:title", content: "dek.pub" },
      { property: "og:description", content: translate(lang, "site.description") },
      { property: "og:url", content: `${env.APP_ORIGIN}/` },
      { property: "og:site_name", content: "dek.pub" },
      { name: "twitter:card", content: "summary" },
    ],
  };
});
