import { defineHandler, defineHead, type InferProps } from "void";
import { appUrl } from "../../src/common/http.server.ts";
import { translate } from "../../src/common/i18n.ts";
import { loadProfile } from "../../src/model/person/feature/profile/load.server.ts";
import { profilePage } from "../../src/model/person/feature/profile/paging.ts";
import { profileView } from "../../src/model/person/feature/profile/view.ts";
import { profilePath } from "../../src/model/person/profile-path.ts";

export type Props = InferProps<typeof loader>;

export const loader = defineHandler(async (c) => {
  const profile = await loadProfile(c, c.req.param("profile"), profilePage(c.req.query("page")));
  if (!profile) {
    c.set("pageStatus", 404);
  }
  return { profile, view: profileView(c.req.query("view")) };
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
      {
        rel: "alternate",
        type: "application/rss+xml",
        title: `${profile.name} · dek.pub`,
        href: appUrl(`${profilePath(profile.handle)}/rss`),
      },
      { rel: "canonical", href: profile.url },
    ],
  };
});
