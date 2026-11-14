import { defineHandler, defineHead, type InferProps } from "void";
import { translate } from "../../../src/common/i18n.ts";
import { EARLY_LISTENER } from "../../../src/model/deck/feature/talk/embed.ts";
import { loadTalk } from "../../../src/model/deck/feature/talk/load.server.ts";

export type Props = InferProps<typeof loader>;

export const loader = defineHandler(async (c) => {
  const talk = await loadTalk(c, c.req.param("profile"), c.req.param("slug"));
  if (!talk) {
    c.set("pageStatus", 404);
  }
  return { talk };
});

export const head = defineHead<Props>((c, { talk }) => {
  if (!talk) {
    return {
      title: translate(c.get("shared").lang, "404.title"),
      meta: [{ name: "robots", content: "noindex" }],
    };
  }
  const description =
    talk.description ??
    talk.slides.find((slide) => slide.paragraphs?.length)?.paragraphs?.[0]?.slice(0, 200) ??
    "";
  return {
    title: talk.title,
    meta: [
      { name: "description", content: description },
      { property: "og:type", content: "article" },
      { property: "og:title", content: talk.title },
      { property: "og:description", content: description },
      { property: "og:url", content: talk.url },
      { property: "og:site_name", content: "dek.pub" },
      ...(talk.image ? [{ property: "og:image", content: talk.image }] : []),
      { name: "twitter:card", content: talk.image ? "summary_large_image" : "summary" },
      { name: "twitter:title", content: talk.title },
      ...(talk.image ? [{ name: "twitter:image", content: talk.image }] : []),
      ...(talk.visibility === "public" && talk.version === talk.current
        ? []
        : [{ name: "robots", content: "noindex" }]),
    ],
    link: [{ rel: "canonical", href: talk.url }],
    script: [{ innerHTML: EARLY_LISTENER }],
  };
});
