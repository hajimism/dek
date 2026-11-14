// What every answer from the app's origin carries: `src/shell/headers.ts` says what and why.

import { defineMiddleware } from "void";
import { applyAppHeaders } from "../src/shell/headers.ts";

export default defineMiddleware(async (c, next) => {
  await next();
  applyAppHeaders(c.res.headers, new URL(c.req.url));
});
