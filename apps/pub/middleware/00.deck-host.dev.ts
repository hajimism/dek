// In development only: answer d-<id>.localhost the way the serve Worker answers
// d-<id>.dekusercontent.com, from the same local R2. The deck still gets an origin of its own,
// which the app's cookies do not reach. Deployed, the serve Worker is its own Worker.

import { defineMiddleware } from "void";
import { env } from "void/env";
import { storage } from "void/storage";
import { deckIdFromHost } from "../src/lib/deck-origin.ts";
import { handleServe } from "../serve/src/index.ts";

export default defineMiddleware(async (c, next) => {
  if (!deckIdFromHost(new URL(c.req.url).host)) {
    return next();
  }
  return handleServe(c.req.raw, {
    STORAGE: storage as unknown as R2Bucket,
    SERVE_TOKEN_SECRET: env.SERVE_TOKEN_SECRET,
    APP_ORIGIN: env.APP_ORIGIN,
  });
});
