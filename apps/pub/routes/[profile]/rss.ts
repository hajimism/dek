import { defineHandler } from "void";
import { env } from "void/env";
import { talksBy } from "../../src/model/deck/card.server.ts";
import { talkFeed } from "../../src/model/person/feature/profile/rss.ts";
import { handleOf } from "../../src/model/person/profile-path.ts";
import { personByHandle } from "../../src/model/person/store.server.ts";

export const GET = defineHandler(async (c) => {
  const handle = handleOf(c.req.param("profile"));
  const person = handle ? await personByHandle(c, handle) : null;
  if (!person) {
    return c.text("not found", 404);
  }
  const talks = await talksBy(c, person, { publicOnly: true, limit: 50 });
  return new Response(talkFeed(person, talks, env.APP_ORIGIN), {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=600",
    },
  });
});
