import { defineHandler, defineHead } from "void";
import { translate } from "../src/common/i18n.ts";

export const loader = defineHandler((c) => {
  c.set("pageStatus", 404);
  return {};
});

export const head = defineHead((c) => ({
  title: translate(c.get("shared").lang, "404.title"),
  meta: [{ name: "robots", content: "noindex" }],
}));
