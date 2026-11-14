import { defineHandler, defineHead, type InferProps } from "void";
import { translate } from "../src/common/i18n.ts";
import { loadWelcome } from "../src/model/person/feature/choose-handle/load.server.ts";

export type Props = InferProps<typeof loader>;

/** Every page sends an account with no handle here first, with `next` the page it asked for. */
export const loader = defineHandler(async (c) => {
  const welcome = await loadWelcome(c, c.req.query("next"));
  return "redirect" in welcome ? c.redirect(welcome.redirect) : welcome;
});

export const head = defineHead<Props>((c) => ({
  title: translate(c.get("shared").lang, "welcome.title"),
  meta: [{ name: "robots", content: "noindex" }],
}));
