import { defineHandler, defineHead, type InferProps } from "void";
import { translate } from "../../../src/common/i18n.ts";
import { deckStatus } from "../../../src/model/deck/store.server.ts";
import { grantList, loadOwnedDeck } from "../../../src/model/deck/feature/talk/load.server.ts";

export type Props = InferProps<typeof loader>;

export const loader = defineHandler(async (c) => {
  const owned = await loadOwnedDeck(c, c.req.param("profile"), c.req.param("slug"));
  if (!owned) {
    c.set("pageStatus", 404);
    return { manage: null };
  }
  return {
    manage: {
      status: await deckStatus(c, owned.deck),
      grants: await grantList(c, owned.deck.id),
      owner: owned.owner,
    },
  };
});

export const head = defineHead<Props>((c, { manage }) => {
  const lang = c.get("shared").lang;
  return {
    title: manage ? translate(lang, "manage.title", { title: manage.status.title }) : translate(lang, "404.title"),
    meta: [{ name: "robots", content: "noindex" }],
  };
});
