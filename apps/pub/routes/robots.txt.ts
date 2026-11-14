import { defineHandler } from "void";
import { env } from "void/env";
import { robotsFor } from "../src/shell/robots.ts";

export const GET = defineHandler(
  () =>
    new Response(robotsFor(env.APP_ORIGIN), {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
    }),
);
