import { defineHandler, defineHead, type InferProps } from "void";
import { translate } from "../../../src/common/i18n.ts";
import { loadManage } from "../../../src/model/deck/feature/manage/load.server.ts";

export type Props = InferProps<typeof loader>;

export const loader = defineHandler(async (c) => {
  const manage = await loadManage(c, c.req.param("profile"), c.req.param("slug"));
  if (!manage) {
    c.set("pageStatus", 404);
  }
  return { manage };
});

export const head = defineHead<Props>((c, { manage }) => {
  const lang = c.get("shared").lang;
  return {
    title: manage
      ? translate(lang, "manage.title", { title: manage.status.title })
      : translate(lang, "404.title"),
    meta: [{ name: "robots", content: "noindex" }],
  };
});
