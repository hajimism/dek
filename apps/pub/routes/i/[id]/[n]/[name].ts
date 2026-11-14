// A version's pictures, for the script article and link previews. They are passive images, so
// they come from the app's origin, after the same check as the talk page.

import { defineHandler } from "void";
import { notFound } from "../../../../src/common/api-error.ts";
import { api } from "../../../../src/common/http.server.ts";
import { versionStanding } from "../../../../src/model/deck/access.ts";
import { accessOf, isOpen } from "../../../../src/model/deck/serving/access-file.ts";
import { visibleDeck } from "../../../../src/model/deck/store.server.ts";
import { versionFile } from "../../../../src/model/deck/version/store.server.ts";
import { pictureFile } from "../../../../src/model/deck/version/version.ts";
import { currentAccount } from "../../../../src/model/person/actor.server.ts";

export const GET = defineHandler((c) =>
  api(async () => {
    const person = await currentAccount(c);
    const { deck } = await visibleDeck(c.req.param("id") ?? "", person);
    const n = Number(c.req.param("n"));
    const file = pictureFile(c.req.param("name") ?? "");
    if (!file || versionStanding(deck, n) !== "current") {
      throw notFound("picture");
    }
    const object = await versionFile(deck.id, n, file);
    if (!object) {
      throw notFound("picture");
    }
    return new Response(object.body, {
      headers: {
        "content-type": "image/png",
        "cache-control": isOpen(accessOf(deck), n) ? "public, max-age=300" : "private, no-store",
        "x-content-type-options": "nosniff",
        etag: object.httpEtag,
      },
    });
  }, c.req.raw),
);
