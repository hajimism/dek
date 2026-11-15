// What the API refuses before a handler runs, whatever the route: a client newer than the server,
// and a change a page of another origin made with the visitor's cookie.

import { PROTOCOL_HEADER, PROTOCOL_VERSION } from "../../../../src/pub/protocol.ts";
import { ApiError } from "./api-error.ts";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Why the API refuses `request` before anything runs, else null. A client that speaks a newer
 * protocol than this server is told so. A cookie rides along on any request the browser makes, so
 * a change made with one must come from a page of this origin; the CLI sends a key and no cookie.
 */
export function refusal(request: Request): ApiError | null {
  const spoken = Number(request.headers.get(PROTOCOL_HEADER) ?? PROTOCOL_VERSION);
  if (Number.isFinite(spoken) && spoken > PROTOCOL_VERSION) {
    return new ApiError(
      400,
      "protocol",
      `this server speaks protocol ${PROTOCOL_VERSION}, not ${spoken}`,
      "use a dekc as old as the server, or wait for the server to update",
    );
  }
  if (!SAFE_METHODS.has(request.method) && request.headers.has("cookie")) {
    const origin = request.headers.get("origin");
    if (origin !== new URL(request.url).origin) {
      return new ApiError(403, "cross_origin", "a change must come from a page of dek.pub");
    }
  }
  return null;
}
