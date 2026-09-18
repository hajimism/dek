import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderDeckHtml } from "../core/document.ts";
import { escapeHtml } from "../core/escape.ts";
import { readTheme, renderIndexHtml, slideFragment } from "../core/html.ts";
import { DekError, type Project, type ProjectDeck, resolveProject } from "../core/index.ts";
import { isInside } from "../core/path.ts";
import type { PlaywrightRunner } from "../core/playwright.ts";
import { locateDeck } from "../core/resolve.ts";
import type { Position } from "../core/step.ts";
import { liveReloadScript, playerScript } from "../runtime/player.ts";
import { parsePosition } from "../runtime/position.ts";
import { controlAuth, presenterAuth, wsHasControl } from "./auth.ts";
import { createEventHub, type DevEvent, type EventHub } from "./hub.ts";
import { generateRemotePassword, lanUrls } from "./lan.ts";
import { isPidAlive, readDevServerLock, removeDevServerLock, writeDevServerLock } from "./lock.ts";
import { type Stoppable, watchDeck } from "./watch.ts";

export type { DevEvent };

export type DevServer = {
  url: string;
  listenHostname: string;
  remoteUrls: string[];
  deckDir?: string;
  decks: string[];
  close: () => Promise<void>;
  events: AsyncIterable<DevEvent>;
};

export async function startDevServer(options: {
  cwd: string;
  port?: number;
  visualRunner?: PlaywrightRunner;
  remote?: boolean;
  password?: string;
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
  const deckScope = locateDeck(project.root, options.cwd);
  const deckDir = deckScope?.dir;
  const scopedDeckName = deckScope?.name;
  const remote = options.remote === true;
  const password = remote ? (options.password ?? generateRemotePassword()) : options.password;
  const listenHostname = remote ? "0.0.0.0" : "127.0.0.1";
  const pages = new Map<string, string>();
  const inner = createEventHub();
  const hub: EventHub = {
    emit(event) {
      if (event.type === "sync") {
        project = resolveProject(projectRoot);
      }
      if (event.type !== "diagnostics" && event.type !== "timeline") {
        pages.clear();
      }
      inner.emit(event);
    },
    close() {
      inner.close();
    },
    subscribe() {
      return inner.subscribe();
    },
    [Symbol.asyncIterator]() {
      return inner[Symbol.asyncIterator]();
    },
  };
  const watchers: Stoppable[] = [];
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

  if (deckDir) {
    watchers.push(watchDeck(deckDir, hub, { visualRunner: options.visualRunner }));
  } else {
    for (const deck of project.decks) {
      watchers.push(watchDeck(deck.dir, hub, { visualRunner: options.visualRunner }));
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

  const server = Bun.serve<WsData>({
    hostname: listenHostname,
    port: options.port ?? 0,
    async fetch(req, bunServer) {
      const url = new URL(req.url);
      const room = matchWsRoom(url.pathname, scopedDeckName);
      if (room !== undefined) {
        if (bunServer.upgrade(req, { data: { room, control: wsHasControl(req, password) } })) {
          return;
        }
        return new Response("Expected WebSocket", { status: 400 });
      }
      if (url.pathname === "/events") {
        return sseResponse(hub);
      }
      const fragment = matchSlideFragment(url.pathname, deckDir);
      if (fragment) {
        const deck = deckForFragment(fragment, project, scopedDeckName);
        if (!deck) {
          return new Response("Not found", { status: 404 });
        }
        const html = slideFragment(deck, fragment.slug, { inline: false });
        if (!html) {
          return new Response("Not found", { status: 404 });
        }
        return htmlResponse(html);
      }
      const themeRoute = matchThemeRoute(url.pathname, deckDir);
      if (themeRoute) {
        const deck = deckForFragment(themeRoute, project, scopedDeckName);
        if (!deck) {
          return new Response("Not found", { status: 404 });
        }
        return new Response(readTheme(deck.dir, false), {
          headers: {
            "content-type": "text/css; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }
      const voice = matchVoiceRoute(url.pathname, deckDir, project.decks);
      if (voice) {
        const file = join(project.root, ".dek", "voice", voice.deckName, voice.file);
        if (!existsSync(file)) {
          return new Response("Not found", { status: 404 });
        }
        return new Response(Bun.file(file), {
          headers: {
            "content-type":
              voice.file === "audio.wav" ? "audio/wav" : "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }
      const nav = matchNavRoute(url.pathname, scopedDeckName);
      if (nav) {
        const unauthorized = controlAuth(req, password);
        if (unauthorized) {
          return unauthorized;
        }
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
      }
      const asset = matchAssetFile(url.pathname, deckDir, project);
      if (asset) {
        return new Response(Bun.file(asset), {
          headers: { "cache-control": "no-store" },
        });
      }
      if (deckDir) {
        const mode =
          url.pathname === "/presenter" || url.pathname === "/presenter/" ? "presenter" : "player";
        const unauthorized = presenterAuth(req, mode, password);
        if (unauthorized) {
          return unauthorized;
        }
        try {
          return htmlResponse(
            await cached(`${deckDir}:${mode}`, () =>
              renderDeckHtml(deckDir, {
                mode,
                live: true,
                includeNotes: mode === "presenter" || !remote,
                ...embed,
                ...(mode === "presenter" && password ? { wsToken: password } : {}),
              }),
            ),
          );
        } catch (error) {
          return htmlResponse(errorPage(error), 500);
        }
      }
      const deckRoute = matchDeckRoute(url.pathname);
      if (deckRoute) {
        const deck = project.decks.find((entry) => entry.name === deckRoute.name);
        if (!deck) {
          return new Response("Not found", { status: 404 });
        }
        const unauthorized = presenterAuth(req, deckRoute.mode, password);
        if (unauthorized) {
          return unauthorized;
        }
        try {
          return htmlResponse(
            await cached(`${deck.dir}:${deckRoute.mode}`, () =>
              renderDeckHtml(deck.dir, {
                mode: deckRoute.mode,
                live: true,
                includeNotes: deckRoute.mode === "presenter" || !remote,
                ...embed,
                ...(deckRoute.mode === "presenter" && password ? { wsToken: password } : {}),
              }),
            ),
          );
        } catch (error) {
          return htmlResponse(errorPage(error), 500);
        }
      }
      if (url.pathname !== "/" && url.pathname !== "") {
        return new Response("Not found", { status: 404 });
      }
      return htmlResponse(
        await cached("index", () => {
          const fresh = resolveProject(options.cwd);
          return renderIndexHtml(
            fresh.decks.map((deck) => ({ name: deck.name, title: deck.deck.title })),
            fresh.failed.map((entry) => ({ name: entry.name })),
          );
        }),
      );
    },
    websocket: {
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
        for (const client of clients) {
          if (client !== ws) {
            client.send(payload);
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

  const port = server.port ?? 0;
  const url = `http://127.0.0.1:${port}/`;
  const remoteUrls = uniqueUrls([url, ...(remote ? lanUrls(port) : [])]);
  try {
    writeDevServerLock(project.root, url, password);
  } catch (error) {
    for (const watcher of watchers) {
      watcher.close();
    }
    hub.close();
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
    async close() {
      for (const watcher of watchers) {
        watcher.close();
      }
      hub.close();
      removeDevServerLock(project.root);
      await server.stop(true);
    },
  };
}

function matchSlideFragment(
  pathname: string,
  deckDir: string | undefined,
): { deckName?: string; slug: string } | undefined {
  const deckSlide = pathname.match(/^\/decks\/([^/]+)\/slide\/([^/]+)\/?$/);
  if (deckSlide?.[1] && deckSlide[2]) {
    return { deckName: deckSlide[1], slug: decodeURIComponent(deckSlide[2]) };
  }
  const slide = pathname.match(/^\/slide\/([^/]+)\/?$/);
  if (slide?.[1] && deckDir) {
    return { slug: decodeURIComponent(slide[1]) };
  }
  return undefined;
}

function matchThemeRoute(
  pathname: string,
  deckDir: string | undefined,
): { deckName?: string } | undefined {
  const deckTheme = pathname.match(/^\/decks\/([^/]+)\/theme\/?$/);
  if (deckTheme?.[1]) {
    return { deckName: deckTheme[1] };
  }
  if ((pathname === "/theme" || pathname === "/theme/") && deckDir) {
    return {};
  }
  return undefined;
}

function deckForFragment(
  route: { deckName?: string },
  project: Project,
  scopedDeckName: string | undefined,
): ProjectDeck | undefined {
  const name = route.deckName ?? scopedDeckName;
  if (!name) {
    return undefined;
  }
  return project.decks.find((entry) => entry.name === name);
}

function matchAssetFile(
  pathname: string,
  deckDir: string | undefined,
  project: Project,
): string | undefined {
  const scoped = pathname.match(/^\/assets\/(.+)$/);
  if (scoped?.[1] && deckDir) {
    return safeDeckAsset(deckDir, scoped[1]);
  }
  const prefixed = pathname.match(/^\/decks\/([^/]+)\/assets\/(.+)$/);
  if (prefixed?.[1] && prefixed[2]) {
    const deck = project.decks.find((entry) => entry.name === prefixed[1]);
    if (!deck) {
      return undefined;
    }
    return safeDeckAsset(deck.dir, prefixed[2]);
  }
  return undefined;
}

function safeDeckAsset(deckDir: string, relative: string): string | undefined {
  const file = join(deckDir, "assets", decodeURIComponent(relative));
  const root = join(deckDir, "assets");
  if (!isInside(file, root) || !existsSync(file) || !statSync(file).isFile()) {
    return undefined;
  }
  return file;
}

function matchWsRoom(pathname: string, scopedDeckName: string | undefined): string | undefined {
  const deckWs = pathname.match(/^\/decks\/([^/]+)\/ws\/?$/);
  if (deckWs?.[1]) {
    return deckWs[1];
  }
  if ((pathname === "/ws" || pathname === "/ws/") && scopedDeckName) {
    return scopedDeckName;
  }
  return undefined;
}

function matchNavRoute(
  pathname: string,
  scopedDeckName: string | undefined,
): { room: string; action: "current" | "goto" } | undefined {
  const deckNav = pathname.match(/^\/decks\/([^/]+)\/(current|goto)\/?$/);
  if (deckNav?.[1] && (deckNav[2] === "current" || deckNav[2] === "goto")) {
    return { room: deckNav[1], action: deckNav[2] };
  }
  if ((pathname === "/current" || pathname === "/current/") && scopedDeckName) {
    return { room: scopedDeckName, action: "current" };
  }
  if ((pathname === "/goto" || pathname === "/goto/") && scopedDeckName) {
    return { room: scopedDeckName, action: "goto" };
  }
  return undefined;
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
  deckDir: string | undefined,
  decks: ProjectDeck[],
): { deckName: string; file: "timeline.json" | "audio.wav" } | undefined {
  const nested = pathname.match(/^\/decks\/([^/]+)\/voice\/(timeline\.json|audio\.wav)$/);
  if (nested?.[1] && nested[2]) {
    if (!decks.some((deck) => deck.name === nested[1])) {
      return undefined;
    }
    return { deckName: nested[1], file: nested[2] as "timeline.json" | "audio.wav" };
  }
  const local = pathname.match(/^\/voice\/(timeline\.json|audio\.wav)$/);
  if (local?.[1] && deckDir) {
    const name = decks.find((deck) => deck.dir === deckDir)?.name;
    if (!name) {
      return undefined;
    }
    return { deckName: name, file: local[1] as "timeline.json" | "audio.wav" };
  }
  return undefined;
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
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>dek</title>
</head>
<body>
  <pre>${escapeHtml(`${message}${hint}`)}</pre>
</body>
</html>
`;
}

function sseResponse(hub: EventHub): Response {
  return new Response(hub.subscribe(), {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
    },
  });
}
