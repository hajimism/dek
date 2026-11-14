import { defineHandler } from "void";
import { env } from "void/env";
import { sitemapText } from "../src/model/deck/feature/sitemap/load.server.ts";

export const GET = defineHandler(
  async (c) =>
    new Response(await sitemapText(c, env.APP_ORIGIN), {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
    }),
);
