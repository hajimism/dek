// What every answer from the app's origin carries. No page of dek.pub is ever framed, and a page
// opened from a deck cannot reach back into the tab that opened it.

import { defineMiddleware } from "void";

export default defineMiddleware(async (c, next) => {
  await next();
  const headers = c.res.headers;
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("x-frame-options", "DENY");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  if (!headers.has("content-security-policy")) {
    headers.set("content-security-policy", "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  }
});
