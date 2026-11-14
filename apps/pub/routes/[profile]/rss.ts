import { defineHandler } from "void";
import { loadFeed } from "../../src/model/person/feature/profile/load.server.ts";

export const GET = defineHandler(async (c) => {
  const feed = await loadFeed(c, c.req.param("profile"));
  if (feed === null) {
    return c.text("not found", 404);
  }
  return new Response(feed, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=600",
    },
  });
});
