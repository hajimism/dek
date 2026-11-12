// A version's pictures, for the script article and link previews: `cover`, or `s-<slug>` for a
// slide as it arrives. They are passive images, so they come from the app's origin, after the
// same check as the talk page.

import { defineHandler } from "void";
import { storage } from "void/storage";
import { versionKey } from "../../../../src/lib/deck-origin.ts";
import { currentPerson } from "../../../../src/server/actor.ts";
import { visibleDeck } from "../../../../src/server/decks.ts";
import { api, notFound } from "../../../../src/server/http.ts";

export const GET = defineHandler((c) =>
  api(async () => {
    const person = await currentPerson(c);
    const { deck } = await visibleDeck(c.req.param("id") ?? "", person);
    const n = Number(c.req.param("n"));
    const name = c.req.param("name") ?? "";
    const file = name === "cover" ? "cover.png" : name.startsWith("s-") ? `shots/${name.slice(2)}.png` : null;
    if (!file || !Number.isInteger(n) || n < 1 || n > (deck.latestVersion ?? 0)) {
      throw notFound("picture");
    }
    const object = await storage.get(versionKey(deck.id, n, file));
    if (!object) {
      throw notFound("picture");
    }
    const open = deck.visibility === "public" && n === deck.currentVersion;
    return new Response(object.body, {
      headers: {
        "content-type": "image/png",
        "cache-control": open ? "public, max-age=86400" : "private, max-age=300",
        "x-content-type-options": "nosniff",
        etag: object.httpEtag,
      },
    });
  }),
);
