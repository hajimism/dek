// The serve Worker. It answers on d-<id>.dekusercontent.com with one built deck and nothing
// else: no cookie, no database, no other deck. A public deck's current version is served to
// anyone; every other build needs a token the app signed for that deck, version and build.

import {
  accessKey,
  type DeckAccess,
  deckIdFromHost,
  versionKey,
} from "../../src/lib/deck-origin.ts";
import { type Variant, verifyServeToken } from "../../src/lib/serve-token.ts";

export type ServeEnv = {
  STORAGE: R2Bucket;
  SERVE_TOKEN_SECRET: string;
  /** The app's origin: the one page that may frame a deck that does not allow embedding. */
  APP_ORIGIN: string;
};

const VERSION_PATH = /^\/v\/(\d{1,6})\/$/;

export async function handleServe(
  request: Request,
  env: ServeEnv,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return plain(405, "method not allowed", { allow: "GET, HEAD" });
  }
  const url = new URL(request.url);
  const deckId = deckIdFromHost(url.host);
  const match = VERSION_PATH.exec(url.pathname);
  if (!deckId || !match) {
    return plain(404, "not found");
  }
  const n = Number(match[1]);
  const access = await readAccess(env.STORAGE, deckId);
  if (!access) {
    return plain(404, "not found");
  }

  const token = url.searchParams.get("t");
  let variant: Variant;
  let open: boolean;
  if (token) {
    const claims = await verifyServeToken(env.SERVE_TOKEN_SECRET, token, nowSeconds);
    if (!claims || claims.deck !== deckId || claims.n !== n) {
      return plain(403, "this link has expired; reload the talk page");
    }
    variant = claims.variant;
    open = false;
  } else if (access.visibility === "public" && access.current === n) {
    variant = access.scriptPublic ? "public" : "bare";
    open = true;
  } else {
    return plain(404, "not found");
  }

  const object = await env.STORAGE.get(versionKey(deckId, n, `${variant}.html`));
  if (!object) {
    return plain(404, "not found");
  }
  const headers = deckHeaders(env.APP_ORIGIN, access.embed && open);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set(
    "cache-control",
    // A public deck can become private or roll back at any time, so a cache keeps it a minute.
    open ? "public, max-age=60" : "private, no-store",
  );
  headers.set("etag", object.httpEtag);
  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}

async function readAccess(bucket: R2Bucket, deckId: string): Promise<DeckAccess | null> {
  const object = await bucket.get(accessKey(deckId));
  if (!object) {
    return null;
  }
  try {
    return (await object.json()) as DeckAccess;
  } catch {
    return null;
  }
}

/**
 * The page a deck runs in: its own script and styles run, and it reaches nothing. The deck's
 * slides are its author's code, so the origin holds nothing worth taking and the policy stops
 * every request out, a form, and a base change.
 */
export function deckHeaders(appOrigin: string, embeddable: boolean): Headers {
  return new Headers({
    "content-security-policy": [
      "default-src 'none'",
      "script-src 'unsafe-inline'",
      "style-src 'unsafe-inline'",
      "img-src data: blob:",
      "font-src data:",
      "media-src data: blob:",
      "connect-src 'none'",
      "form-action 'none'",
      "base-uri 'none'",
      `frame-ancestors ${embeddable ? "*" : appOrigin}`,
      // The same sandbox as the iframe's, so a deck opened by its URL is held as it is framed.
      "sandbox allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox",
    ].join("; "),
    "cross-origin-opener-policy": "same-origin",
    "permissions-policy": `camera=(), microphone=(), geolocation=(), usb=(), payment=(), fullscreen=(self "${appOrigin}")`,
    "cross-origin-resource-policy": "cross-origin",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
}

function plain(status: number, text: string, extra: Record<string, string> = {}): Response {
  return new Response(`${text}\n`, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extra,
    },
  });
}

export default {
  fetch(request: Request, env: ServeEnv): Promise<Response> {
    return handleServe(request, env);
  },
} satisfies ExportedHandler<ServeEnv>;
