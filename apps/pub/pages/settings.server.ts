import { defineHandler, defineHead, type InferProps } from "void";
import type { Href } from "void/routes";
import { translate } from "../src/common/i18n.ts";
import { loadSettings } from "../src/model/person/feature/settings/load.server.ts";

export type Props = InferProps<typeof loader>;

/** A person's settings; signed out, the sign-in page first, coming back here. */
export const loader = defineHandler(async (c) => {
  const settings = await loadSettings(c);
  // Built here, query and all, so it is not a route literal Void can check.
  return "redirect" in settings ? c.redirect(settings.redirect as Href) : settings;
});

export const head = defineHead<Props>((c) => ({
  title: translate(c.get("shared").lang, "settings.title"),
  meta: [{ name: "robots", content: "noindex" }],
}));
