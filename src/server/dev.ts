import { existsSync, watch } from "node:fs";
import { join } from "node:path";
import { fileInside } from "../core/assets.ts";
import { renderDeckHtml } from "../core/document.ts";
import { escapeHtml } from "../core/escape.ts";
import { htmlShell, readTheme, renderIndexHtml, slideFragment } from "../core/html.ts";
import { DekError, type Project, type ProjectDeck, resolveProject } from "../core/index.ts";
import type { PlaywrightRunner } from "../core/playwright.ts";
import { locateDeck } from "../core/resolve.ts";
import type { Position } from "../core/step.ts";
import { voiceCacheFile } from "../core/voice.ts";
import { liveReloadScript, playerScript } from "../runtime/player.ts";
import { parsePosition } from "../runtime/position.ts";
import { isExactPath, splitDeckPath } from "../runtime/routes.ts";
import {
  clearance,
  EVENT_EXPOSURE,
  type Exposure,
  mayRead,
  pairingResponse,
  ROUTE_EXPOSURE,
  type Route,
  requestGuard,
  unauthorized,
} from "./auth.ts";
import { createEventHub, type DevEvent, type EventHub } from "./hub.ts";
import { generateRemotePassword, lanUrls } from "./lan.ts";
import { isPidAlive, readDevServerLock, removeDevServerLock, writeDevServerLock } from "./lock.ts";
import { createPairings } from "./pairing.ts";
import { POLL_INTERVAL_MS, type Stoppable, watchDeck, watchTargets } from "./watch.ts";

export type { DevEvent };

export type DevServer = {
  url: string;
  listenHostname: string;
  remoteUrls: string[];
  deckDir?: string;
  decks: string[];
  close: () => Promise<void>;
  events: AsyncIterable<DevEvent>;
  /** With --remote: a one-use code for a QR code that lets a phone in as the presenter. */
  pair?: () => string;
};

export async function startDevServer(options: {
  cwd: string;
  deck?: string;
  port?: number;
  visual?: boolean;
  visualRunner?: PlaywrightRunner;
  remote?: boolean;
  /** The --remote password, which dek makes; never taken from the user, so never weak. */
  password?: string;
  /** How long a pairing code stays good; see PAIRING_TTL_MS. */
  pairingTtlMs?: number;
  /** How often the project and each deck are re-scanned for edits fs.watch missed. */
  pollIntervalMs?: number;
}): Promise<DevServer> {
  const projectRoot = options.cwd;
  let project = resolveProject(projectRoot);
  const existing = readDevServerLock(project.root);
  if (existing && isPidAlive(existing.pid)) {
    throw new DekError(`dev server already running at ${existing.url}`, {
      path: join(project.root, ".dek", "server.json"),
      hint: `open ${existing.url}`,
    });
  }
  const fromCwd = locateDeck(project.root, options.cwd);
  const scopedDeckName = options.deck ?? fromCwd?.name;
  if (options.deck) {
    const known =
      project.decks.some((entry) => entry.name === options.deck) ||
      project.failed.some((entry) => entry.name === options.deck);
    if (!known) {
      throw new DekError(`deck "${options.deck}" not found`, {
        path: join(project.root, "decks", options.deck),
        hint: "run `dek ls`",
      });
    }
  }
  const deckDir = scopedDeckName ? join(project.root, "decks", scopedDeckName) : fromCwd?.dir;
  const remote = options.remote === true;
  // An empty one would open the presenter to the LAN.
  const password = remote ? options.password || generateRemotePassword() : options.password;
  const listenHostname = remote ? "0.0.0.0" : "127.0.0.1";
  const pairings = remote
    ? createPairings(options.pairingTtlMs !== undefined ? { ttlMs: options.pairingTtlMs } : {})
    : undefined;
  // What a paired phone's cookie carries: new on every start, so a restart ends every pairing.
  const sessionSecret = generateRemotePassword(32);
  const pages = new Map<string, string>();
  const inner = createEventHub();
  const watchers = new Map<string, Stoppable>();
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  const watchOptions = {
    visual: options.visual === true,
    visualRunner: options.visualRunner,
    pollIntervalMs,
  };
  const hub: EventHub = {
    emit(event) {
      if (event.type === "sync") {
        refreshProject();
      }
      if (event.type !== "diagnostics" && event.type !== "timeline") {
        pages.clear();
      }
      inner.emit(event);
    },
    close() {
      inner.close();
    },
    subscribe(accept) {
      return inner.subscribe(accept);
    },
    [Symbol.asyncIterator]() {
      return inner[Symbol.asyncIterator]();
    },
  };
  let stopped = false;
  const reconcileWatchers = (): void => {
    const targets = new Set(
      scopedDeckName ? [join(project.root, "decks", scopedDeckName)] : watchTargets(project),
    );
    for (const dir of targets) {
      if (!watchers.has(dir)) {
        watchers.set(dir, watchDeck(dir, hub, watchOptions));
      }
    }
    for (const [dir, watcher] of watchers) {
      if (!targets.has(dir)) {
        watcher.close();
        watchers.delete(dir);
      }
    }
  };
  /**
   * Re-read the project after decks come and go. The cached index lists the deck set, so it is
   * dropped when that set changes; deck pages are dropped by their own watcher's events.
   */
  const refreshProject = (): void => {
    // fs.watch can deliver an event after close; a watcher made then would outlive the server.
    if (stopped) {
      return;
    }
    try {
      const fresh = resolveProject(projectRoot);
      const changed = deckNames(fresh) !== deckNames(project);
      project = fresh;
      if (changed) {
        pages.clear();
      }
      reconcileWatchers();
    } catch {
      // dek.toml may disappear mid-write; keep the last known project.
    }
  };
  const embed = {
    playerScript: await playerScript(),
    liveReloadScript: liveReloadScript(),
  };

  const cached = async (key: string, render: () => string | Promise<string>): Promise<string> => {
    const hit = pages.get(key);
    if (hit !== undefined) {
      return hit;
    }
    const html = await render();
    pages.set(key, html);
    return html;
  };

  const liveDeckResponse = async (dir: string, mode: "player" | "presenter"): Promise<Response> => {
    try {
      return htmlResponse(
        await cached(`${dir}:${mode}`, () =>
          renderDeckHtml(dir, {
            mode,
            live: true,
            includeNotes: mode === "presenter" || !remote,
            ...embed,
            ...(mode === "presenter" && password ? { liveToken: password } : {}),
          }),
        ),
      );
    } catch (error) {
      return htmlResponse(errorPage(error), 500);
    }
  };

  reconcileWatchers();
  let decksDirWatcher: { close: () => void } | undefined;
  if (!scopedDeckName) {
    const decksDir = join(project.root, "decks");
    try {
      const dirWatcher = watch(decksDir, { recursive: true }, refreshProject);
      const timer = setInterval(refreshProject, pollIntervalMs);
      decksDirWatcher = {
        close() {
          dirWatcher.close();
          clearInterval(timer);
        },
      };
    } catch {
      decksDirWatcher = undefined;
    }
  }

  type WsData = { room: string; control: boolean };
  const rooms = new Map<string, Set<import("bun").ServerWebSocket<WsData>>>();
  const positions = new Map<string, Position>();

  const deckForRoom = (room: string): ProjectDeck | undefined => {
    return project.decks.find((entry) => entry.name === room);
  };

  const currentFor = (room: string): { slug: string; slideIndex: number; beatIndex: number } => {
    const deck = deckForRoom(room);
    const fallback = { slug: deck?.deck.sections[0]?.slug ?? room, slideIndex: 0, beatIndex: 0 };
    const pos = positions.get(room) ?? { slideIndex: 0, beatIndex: 0 };
    const slug = deck?.deck.sections[pos.slideIndex]?.slug;
    if (!slug) {
      return fallback;
    }
    return { slug, slideIndex: pos.slideIndex, beatIndex: pos.beatIndex };
  };

  const gotoRoom = (room: string, slug: string): Response => {
    const deck = deckForRoom(room);
    if (!deck) {
      return jsonResponse({ ok: false, error: { message: `deck "${room}" not found` } }, 404);
    }
    const slideIndex = deck.deck.sections.findIndex((section) => section.slug === slug);
    if (slideIndex < 0) {
      return jsonResponse({ ok: false, error: { message: `section "${slug}" not found` } }, 404);
    }
    const pos = { slideIndex, beatIndex: 0 };
    positions.set(room, pos);
    const payload = JSON.stringify(pos);
    for (const client of rooms.get(room) ?? []) {
      client.send(payload);
    }
    return jsonResponse({ ok: true, ...currentFor(room) });
  };

  const stopWatching = (): void => {
    stopped = true;
    for (const watcher of watchers.values()) {
      watcher.close();
    }
    decksDirWatcher?.close();
    hub.close();
  };

  /**
   * Which route a request names, and how it answers. The server checks the route's exposure
   * before it answers, so no route guards itself; `seen` is what the request is cleared for.
   */
  const route = (
    req: Request,
    bunServer: import("bun").Server<WsData>,
  ): {
    route: Route;
    respond: (seen: Exposure) => Response | undefined | Promise<Response | undefined>;
  } => {
    const url = new URL(req.url);
    const room = matchWsRoom(url.pathname, scopedDeckName);
    if (room !== undefined) {
      return {
        route: "socket",
        respond: (seen) =>
          bunServer.upgrade(req, { data: { room, control: seen === "presenter" } })
            ? undefined
            : new Response("Expected WebSocket", { status: 400 }),
      };
    }
    if (url.pathname === "/events") {
      return { route: "events", respond: (seen) => sseResponse(hub, seen) };
    }
    const fragment = matchSlideFragment(url.pathname, scopedDeckName);
    if (fragment) {
      return {
        route: "slide",
        respond: () => {
          const deck = deckForName(project, fragment.deckName);
          const html = deck && slideFragment(deck, fragment.slug, { inline: false });
          return html ? htmlResponse(html) : notFound();
        },
      };
    }
    const themeRoute = matchThemeRoute(url.pathname, scopedDeckName);
    if (themeRoute) {
      return {
        route: "theme",
        respond: () => {
          const deck = deckForName(project, themeRoute.deckName);
          if (!deck) {
            return notFound();
          }
          return new Response(readTheme(deck.dir, false), {
            headers: {
              "content-type": "text/css; charset=utf-8",
              "cache-control": "no-store",
            },
          });
        },
      };
    }
    const voice = matchVoiceRoute(url.pathname, scopedDeckName, project.decks);
    if (voice) {
      return {
        route: "voice",
        respond: () => {
          const file = voiceCacheFile(voice.deckDir, voice.file);
          if (!existsSync(file)) {
            return notFound();
          }
          return new Response(Bun.file(file), {
            headers: {
              "content-type":
                voice.file === "audio.wav" ? "audio/wav" : "application/json; charset=utf-8",
              "cache-control": "no-store",
            },
          });
        },
      };
    }
    const nav = matchNavRoute(url.pathname, scopedDeckName);
    if (nav) {
      return {
        route: "control",
        respond: async () => {
          if (nav.action === "current" && req.method === "GET") {
            return jsonResponse({ ok: true, ...currentFor(nav.room) });
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
              return jsonResponse({ ok: false, error: { message: "usage: dek goto <slug>" } }, 400);
            }
            return gotoRoom(nav.room, slug);
          }
          return new Response("Method not allowed", { status: 405 });
        },
      };
    }
    const asset = matchAssetFile(url.pathname, scopedDeckName, deckDir, project);
    if (asset) {
      return {
        route: "asset",
        respond: () => new Response(Bun.file(asset), { headers: { "cache-control": "no-store" } }),
      };
    }
    if (deckDir) {
      if (isExactPath(url.pathname, "/presenter")) {
        return { route: "presenter", respond: () => liveDeckResponse(deckDir, "presenter") };
      }
      if (url.pathname === "/" || url.pathname === "") {
        return { route: "player", respond: () => liveDeckResponse(deckDir, "player") };
      }
      return { route: "missing", respond: notFound };
    }
    const deckRoute = matchDeckRoute(url.pathname);
    if (deckRoute) {
      const deck = deckForName(project, deckRoute.name);
      if (!deck) {
        return { route: "missing", respond: notFound };
      }
      return { route: deckRoute.mode, respond: () => liveDeckResponse(deck.dir, deckRoute.mode) };
    }
    if (url.pathname !== "/" && url.pathname !== "") {
      return { route: "missing", respond: notFound };
    }
    return {
      route: "index",
      respond: async () =>
        htmlResponse(
          await cached("index", () =>
            renderIndexHtml(
              project.decks.map((deck) => ({ name: deck.name, title: deck.deck.title })),
              project.failed.map((entry) => ({ name: entry.name })),
            ),
          ),
        ),
    };
  };

  const listen = () =>
    Bun.serve<WsData>({
      hostname: listenHostname,
      port: options.port ?? 0,
      // Never Bun's development error page: it shows the source and absolute paths to anyone.
      development: false,
      fetch(req, bunServer) {
        const refused = requestGuard(req, { remote });
        if (refused) {
          return refused;
        }
        // Per port: a phone may pair with two dek servers on one machine.
        const session = { name: `dek-presenter-${bunServer.port}`, secret: sessionSecret };
        const code = pairings && new URL(req.url).searchParams.get("pair");
        if (pairings && typeof code === "string") {
          return pairingResponse(new URL(req.url), pairings.redeem(code), session);
        }
        const routed = route(req, bunServer);
        const seen = clearance(req, password, remote ? session : undefined);
        if (!mayRead(seen, ROUTE_EXPOSURE[routed.route])) {
          return unauthorized();
        }
        return routed.respond(seen);
      },
      error(error) {
        console.error(error);
        return new Response("Internal Server Error\n", { status: 500 });
      },
      websocket: {
        // A position is a few dozen bytes; anything near this is not one.
        maxPayloadLength: 4 * 1024,
        open(ws) {
          const clients = rooms.get(ws.data.room) ?? new Set();
          clients.add(ws);
          rooms.set(ws.data.room, clients);
          const pos = positions.get(ws.data.room);
          if (pos) {
            ws.send(JSON.stringify(pos));
          }
        },
        message(ws, message) {
          if (!ws.data.control) {
            return;
          }
          const payload = typeof message === "string" ? message : new TextDecoder().decode(message);
          const pos = parsePosition(payload);
          if (!pos) {
            return;
          }
          positions.set(ws.data.room, pos);
          const clients = rooms.get(ws.data.room);
          if (!clients) {
            return;
          }
          // The position as parsed, not the message as sent: nothing else rides along to the room.
          const relayed = JSON.stringify(pos);
          for (const client of clients) {
            if (client !== ws) {
              client.send(relayed);
            }
          }
        },
        close(ws) {
          const clients = rooms.get(ws.data.room);
          if (!clients) {
            return;
          }
          clients.delete(ws);
          if (clients.size === 0) {
            rooms.delete(ws.data.room);
          }
        },
      },
    });

  let server: ReturnType<typeof listen>;
  try {
    server = listen();
  } catch (error) {
    stopWatching();
    throw listenError(error, options.port);
  }

  const port = server.port ?? 0;
  const url = `http://127.0.0.1:${port}/`;
  const remoteUrls = uniqueUrls([url, ...(remote ? lanUrls(port) : [])]);
  try {
    writeDevServerLock(project.root, url, password);
  } catch (error) {
    stopWatching();
    await server.stop(true);
    throw error;
  }

  return {
    url,
    listenHostname,
    remoteUrls,
    ...(deckDir ? { deckDir } : {}),
    decks: project.decks.map((deck) => deck.name),
    events: hub,
    ...(pairings ? { pair: () => pairings.issue() } : {}),
    async close() {
      removeDevServerLock(project.root);
      // Connections first: Bun never finishes stopping once two or more SSE streams were closed.
      await server.stop(true);
      stopWatching();
    },
  };
}

function matchDeckRest<T>(
  pathname: string,
  scopedDeckName: string | undefined,
  matchRest: (rest: string, deckName: string) => T | undefined,
): T | undefined {
  const split = splitDeckPath(pathname, scopedDeckName);
  if (!split) {
    return undefined;
  }
  return matchRest(split.rest, split.deckName);
}

function matchSlideFragment(
  pathname: string,
  scopedDeckName: string | undefined,
): { deckName: string; slug: string } | undefined {
  return matchDeckRest(pathname, scopedDeckName, (rest, deckName) => {
    const slug = rest.match(/^\/slide\/([^/]+)\/?$/)?.[1];
    if (!slug) {
      return undefined;
    }
    return { deckName, slug: decodeURIComponent(slug) };
  });
}

function matchThemeRoute(
  pathname: string,
  scopedDeckName: string | undefined,
): { deckName: string } | undefined {
  return matchDeckRest(pathname, scopedDeckName, (rest, deckName) => {
    if (!isExactPath(rest, "/theme")) {
      return undefined;
    }
    return { deckName };
  });
}

/** Every deck name the index lists, parsed or not, as one comparable key. */
function deckNames(project: Project): string {
  return [...project.decks, ...project.failed]
    .map((entry) => entry.name)
    .sort()
    .join("\n");
}

function deckForName(project: Project, name: string): ProjectDeck | undefined {
  return project.decks.find((entry) => entry.name === name);
}

function matchAssetFile(
  pathname: string,
  scopedDeckName: string | undefined,
  deckDir: string | undefined,
  project: Project,
): string | undefined {
  return matchDeckRest(pathname, scopedDeckName, (rest, deckName) => {
    const relative = rest.match(/^\/assets\/(.+)$/)?.[1];
    if (!relative) {
      return undefined;
    }
    if (pathname.startsWith("/decks/")) {
      const deck = deckForName(project, deckName);
      if (!deck) {
        return undefined;
      }
      return safeDeckAsset(deck.dir, relative);
    }
    if (!deckDir) {
      return undefined;
    }
    return safeDeckAsset(deckDir, relative);
  });
}

function safeDeckAsset(deckDir: string, relative: string): string | undefined {
  const root = join(deckDir, "assets");
  const found = fileInside(join(root, decodeURIComponent(relative)), root);
  return found.kind === "file" ? found.path : undefined;
}

function matchWsRoom(pathname: string, scopedDeckName: string | undefined): string | undefined {
  return matchDeckRest(pathname, scopedDeckName, (rest, deckName) => {
    if (!isExactPath(rest, "/ws")) {
      return undefined;
    }
    return deckName;
  });
}

function matchNavRoute(
  pathname: string,
  scopedDeckName: string | undefined,
): { room: string; action: "current" | "goto" } | undefined {
  return matchDeckRest(pathname, scopedDeckName, (rest, deckName) => {
    if (isExactPath(rest, "/current")) {
      return { room: deckName, action: "current" };
    }
    if (isExactPath(rest, "/goto")) {
      return { room: deckName, action: "goto" };
    }
    return undefined;
  });
}

function matchDeckRoute(
  pathname: string,
): { name: string; mode: "player" | "presenter" } | undefined {
  const match = pathname.match(/^\/decks\/([^/]+)(?:\/(presenter)?)?\/?$/);
  if (!match?.[1]) {
    return undefined;
  }
  return { name: match[1], mode: match[2] === "presenter" ? "presenter" : "player" };
}

function matchVoiceRoute(
  pathname: string,
  scopedDeckName: string | undefined,
  decks: ProjectDeck[],
): { deckDir: string; file: "timeline.json" | "audio.wav" } | undefined {
  return matchDeckRest(pathname, scopedDeckName, (rest, deckName) => {
    const file = rest.match(/^\/voice\/(timeline\.json|audio\.wav)$/)?.[1];
    if (file !== "timeline.json" && file !== "audio.wav") {
      return undefined;
    }
    const deck = decks.find((entry) => entry.name === deckName);
    if (!deck) {
      return undefined;
    }
    return { deckDir: deck.dir, file };
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(`${JSON.stringify(body)}\n`, {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function uniqueUrls(urls: string[]): string[] {
  return [...new Set(urls)];
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function errorPage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const hint = error instanceof DekError && error.hint ? `\n${error.hint}` : "";
  return htmlShell({
    title: "dek",
    body: `<pre>${escapeHtml(`${message}${hint}`)}</pre>`,
  });
}

/** The event stream, carrying only the events the request is cleared to read. */
function sseResponse(hub: EventHub, seen: Exposure): Response {
  return new Response(
    hub.subscribe((event) => mayRead(seen, EVENT_EXPOSURE[event.type])),
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

function listenError(error: unknown, port: number | undefined): unknown {
  if (port && (error as { code?: string } | null)?.code === "EADDRINUSE") {
    return new DekError(`port ${port} is already in use`, {
      hint: "pass another --port, or omit it to let the OS choose",
    });
  }
  return error;
}
