import { timingSafeEqual } from "node:crypto";
import type { DevEvent } from "./hub.ts";

/**
 * Requests the dev server refuses before routing. A local server answers only to a loopback Host,
 * so a page on another site cannot reach it by pointing its own name at 127.0.0.1 (DNS
 * rebinding). Anything that moves the deck, a WebSocket or a POST, must come from the deck's own
 * origin or from no browser at all: `dek goto` sends no Origin. A path that does not decode names
 * nothing, so no route has to guard its own decodeURIComponent.
 */
export function requestGuard(req: Request, options: { remote: boolean }): Response | undefined {
  const url = new URL(req.url);
  if (!options.remote && !LOOPBACK_HOSTS.has(url.hostname)) {
    return forbidden("unexpected Host; open the dev server at 127.0.0.1 or localhost");
  }
  if (!decodes(url.pathname)) {
    return new Response("Bad Request: malformed percent-encoding\n", { status: 400 });
  }
  const origin = req.headers.get("origin");
  const moves = req.method !== "GET" || req.headers.get("upgrade")?.toLowerCase() === "websocket";
  if (moves && origin !== null && !sameOrigin(origin, url)) {
    return forbidden("cross-origin request");
  }
  return undefined;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function sameOrigin(origin: string, url: URL): boolean {
  try {
    return new URL(origin).origin === url.origin;
  } catch {
    // "null" from a file:// page or a sandboxed frame is no origin of ours.
    return false;
  }
}

function decodes(pathname: string): boolean {
  try {
    decodeURIComponent(pathname);
    return true;
  } catch {
    return false;
  }
}

function forbidden(reason: string): Response {
  return new Response(`Forbidden: ${reason}\n`, { status: 403 });
}

/**
 * Who may read a response. The audience sees the slides as they are shown; the presenter also
 * sees what they are made from, and may move the deck.
 */
export type Exposure = "audience" | "presenter";

/**
 * What each dev server route reveals. The script, its notes, the voice read from it, and moving
 * the deck belong to the presenter. The server routes only by these names, so a new route does
 * not compile until it is placed here.
 */
export const ROUTE_EXPOSURE = {
  index: "audience",
  player: "audience",
  presenter: "presenter",
  slide: "audience",
  theme: "audience",
  asset: "audience",
  events: "audience",
  socket: "audience",
  voice: "presenter",
  control: "presenter",
  missing: "audience",
} as const satisfies Record<string, Exposure>;

export type Route = keyof typeof ROUTE_EXPOSURE;

/**
 * What each `/events` message reveals. Diagnostics quote the script and name files on disk; the
 * timeline follows the voice. A Record over every event type, so a new one must be placed here.
 */
export const EVENT_EXPOSURE: Record<DevEvent["type"], Exposure> = {
  sync: "audience",
  "reload-slide": "audience",
  "reload-theme": "audience",
  "reload-script": "audience",
  diagnostics: "presenter",
  timeline: "presenter",
};

/** True when a request cleared for `seen` may read what `exposure` names. */
export function mayRead(seen: Exposure, exposure: Exposure): boolean {
  return exposure === "audience" || seen === "presenter";
}

/**
 * The most a request may read: everything without a password, and with one, only what matching
 * HTTP Basic credentials or a `?token=` (a WebSocket cannot send headers) unlock.
 */
export function clearance(req: Request, password: string | undefined): Exposure {
  if (!password) {
    return "presenter";
  }
  const token = new URL(req.url).searchParams.get("token");
  if (token !== null && samePassword(token, password)) {
    return "presenter";
  }
  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice("Basic ".length));
      const colon = decoded.indexOf(":");
      if (samePassword(colon >= 0 ? decoded.slice(colon + 1) : decoded, password)) {
        return "presenter";
      }
    } catch {
      /* malformed credentials */
    }
  }
  return "audience";
}

/** The answer to a request for a presenter route without the password: ask the browser for it. */
export function unauthorized(): Response {
  return new Response("Unauthorized\n", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="dek presenter"' },
  });
}

/** Compare in constant time, so response timing does not leak how much of a guess was right. */
function samePassword(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
