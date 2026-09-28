import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileInside, readTheme } from "../core/assets.ts";
import { errorFields } from "../core/error.ts";
import { escapeAttr, escapeHtml } from "../core/escape.ts";
import { deckSlides, htmlShell, slidePlace, stampSlide } from "../core/html.ts";
import type { Project, ProjectDeck } from "../core/resolve.ts";
import { voiceCacheFile } from "../core/voice.ts";
import { deckRoutePath, parseDeckRoute, splitDeckPath, type VoiceFile } from "../runtime/routes.ts";
import { EVENT_EXPOSURE, type Exposure, mayRead, type Route } from "./auth.ts";
import type { EventHub } from "./hub.ts";
import type { RoomClient, Rooms } from "./rooms.ts";

/** What a socket carries: its deck's room, and whether it may move the room. */
export type WsData = { room: string; control: boolean };

/** What the routes read: the server's scope, its project as it is now, and its state. */
export type RouteContext = {
  /** The deck a server scoped to one deck serves. */
  scopedDeckName?: string;
  deckDir?: string;
  project(): Project;
  hub: EventHub;
  rooms: Rooms<RoomClient>;
  /** A deck's live page. */
  deckPage(dir: string, mode: "player" | "presenter"): Response;
  /** The project's list of decks. */
  indexPage(): Response;
  /** Turn the request into a socket; false when it asked for none. */
  upgrade(req: Request, data: WsData): boolean;
};

export type Routed = {
  route: Route;
  respond: (seen: Exposure) => Response | undefined | Promise<Response | undefined>;
};

/**
 * Which route a request names, and how it answers. The server checks the route's exposure
 * before it answers, so no route guards itself; `seen` is what the request is cleared for.
 */
export function routeRequest(req: Request, ctx: RouteContext): Routed {
  const url = new URL(req.url);
  const split = splitDeckPath(url.pathname, ctx.scopedDeckName);
  if (!split) {
    return url.pathname === "/" || url.pathname === ""
      ? { route: "index", respond: () => ctx.indexPage() }
      : MISSING;
  }
  const route = parseDeckRoute(split.rest);
  if (!route) {
    return MISSING;
  }
  const { deckName } = split;
  const deck = ctx.project().decks.find((entry) => entry.name === deckName);
  // A server scoped to a deck serves its page even while the script fails to parse.
  const dir = ctx.scopedDeckName !== undefined ? ctx.deckDir : deck?.dir;
  switch (route.kind) {
    case "socket":
      return {
        route: "socket",
        respond: (seen) =>
          ctx.upgrade(req, { room: deckName, control: seen === "presenter" })
            ? undefined
            : new Response("Expected WebSocket", { status: 400 }),
      };
    case "events":
      return { route: "events", respond: (seen) => sseResponse(ctx.hub, deckName, seen) };
    case "slide":
      return {
        route: "slide",
        respond: () => {
          // A slide the script does not list has no place in the deck, so no page shows it.
          const sections = deck?.deck.sections ?? [];
          const index = sections.findIndex((section) => section.slug === route.slug);
          const html = deck && index >= 0 && deckSlides(deck).written(route.slug);
          return html
            ? htmlResponse(
                stampSlide(html, { slug: route.slug, place: slidePlace(sections, index) }),
              )
            : notFound();
        },
      };
    case "theme":
      return {
        route: "theme",
        respond: () =>
          deck
            ? new Response(readTheme(deck.dir, false), {
                headers: {
                  "content-type": "text/css; charset=utf-8",
                  "cache-control": "no-store",
                },
              })
            : notFound(),
      };
    case "voice":
      return { route: "voice", respond: () => voiceResponse(deck, route.file) };
    case "current":
    case "goto":
      return {
        route: "control",
        respond: () => navResponse(req, { room: deckName, action: route.kind }, ctx.rooms),
      };
    case "asset": {
      const asset = dir && safeDeckAsset(dir, route.path);
      return asset
        ? {
            route: "asset",
            respond: () =>
              new Response(Bun.file(asset), { headers: { "cache-control": "no-store" } }),
          }
        : MISSING;
    }
    case "player":
    case "presenter": {
      const mode = route.kind;
      return dir ? { route: mode, respond: () => ctx.deckPage(dir, mode) } : MISSING;
    }
  }
}

const MISSING: Routed = { route: "missing", respond: notFound };

function voiceResponse(deck: ProjectDeck | undefined, file: VoiceFile): Response {
  const path = deck && voiceCacheFile(deck.dir, file);
  if (!path || !existsSync(path)) {
    return notFound();
  }
  return new Response(Bun.file(path), {
    headers: {
      "content-type": file === "audio.wav" ? "audio/wav" : "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** `dek current` and `dek goto`: where a deck stands, or send it to a slide. */
async function navResponse(
  req: Request,
  nav: { room: string; action: "current" | "goto" },
  rooms: Rooms<RoomClient>,
): Promise<Response> {
  if (nav.action === "current" && req.method === "GET") {
    return jsonResponse({ ok: true, ...rooms.current(nav.room) });
  }
  if (nav.action === "goto" && req.method === "POST") {
    let body: { slug?: string } = {};
    try {
      body = (await req.json()) as { slug?: string };
    } catch {
      body = {};
    }
    const slug = body.slug?.trim();
    if (!slug) {
      return jsonResponse(
        { ok: false, error: { message: 'the request names no slide: send {"slug": "<slug>"}' } },
        400,
      );
    }
    const moved = rooms.goto(nav.room, slug);
    return moved.ok
      ? jsonResponse({ ok: true, ...moved.at })
      : jsonResponse({ ok: false, error: { message: moved.message } }, 404);
  }
  return new Response("Method not allowed", { status: 405 });
}

function safeDeckAsset(deckDir: string, relative: string): string | undefined {
  const root = join(deckDir, "assets");
  const found = fileInside(join(root, relative), root);
  return found.kind === "file" ? found.path : undefined;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(`${JSON.stringify(body)}\n`, {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function errorPage(error: unknown): string {
  const { message, hint } = errorFields(error);
  return htmlShell({
    title: "dek",
    body: `<pre>${escapeHtml(hint ? `${message}\n${hint}` : message)}</pre>`,
  });
}

/** The project's list of decks, each with its presenter view, and the decks that failed to load. */
export function renderIndexHtml(
  decks: Array<{ name: string; title: string }>,
  failed: Array<{ name: string }> = [],
): string {
  const items = decks
    .map(
      (deck) =>
        `<li><a href="${escapeAttr(deckRoutePath(deck.name, { kind: "player" }))}">${escapeHtml(deck.name)} — ${escapeHtml(deck.title)}</a> · <a href="${escapeAttr(deckRoutePath(deck.name, { kind: "presenter" }))}">presenter</a></li>`,
    )
    .join("");
  const failedItems = failed.map((entry) => `<li>${escapeHtml(entry.name)}</li>`).join("");
  const failedBlock = failed.length > 0 ? `<h2>failed</h2><ul>${failedItems}</ul>` : "";
  return htmlShell({
    title: "dek",
    body: `<h1>decks</h1>
  <ul>${items}</ul>
  ${failedBlock}`,
  });
}

/** A deck's event stream, carrying only the events the request is cleared to read. */
function sseResponse(hub: EventHub, deckName: string, seen: Exposure): Response {
  return new Response(
    hub.sse((event) => event.deck === deckName && mayRead(seen, EVENT_EXPOSURE[event.type])),
    {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        connection: "keep-alive",
      },
    },
  );
}

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}
