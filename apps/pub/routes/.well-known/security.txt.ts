// The catch-all page matches this path, so the copy in public/ would never be reached. The route
// is the one that answers, and it sends that same file (RFC 9116).

import { defineHandler } from "void";
import body from "../../public/.well-known/security.txt?raw";

export const GET = defineHandler(
  () =>
    new Response(body, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
    }),
);
