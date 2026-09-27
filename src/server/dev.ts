import { join } from "node:path";
import { renderDeckHtml } from "../core/document.ts";
import { DekError } from "../core/error.ts";
import type { PlaywrightRunner } from "../core/playwright.ts";
import { locateDeck, resolveProject } from "../core/resolve.ts";
import { liveReloadScript, playerScript } from "../runtime/player.ts";
import {
  clearance,
  mayRead,
  pairingResponse,
  ROUTE_EXPOSURE,
  requestGuard,
  unauthorized,
} from "./auth.ts";
import type { EventFeed } from "./hub.ts";
import { generateRemotePassword, lanUrls } from "./lan.ts";
import { assertNoDevServer, removeDevServerLock, writeDevServerLock } from "./lock.ts";
import { createPairings } from "./pairing.ts";
import { createProjectWatch } from "./project-watch.ts";
import { createRooms, type RoomClient } from "./rooms.ts";
import { errorPage, htmlResponse, renderIndexHtml, routeRequest, type WsData } from "./routes.ts";
import { POLL_INTERVAL_MS } from "./watch.ts";

export type DevServer = {
  url: string;
  listenHostname: string;
  remoteUrls: string[];
  deckDir?: string;
  decks: string[];
  close: () => Promise<void>;
  /** What the decks' watchers report, each event with its deck. */
  events: EventFeed;
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
  const project = resolveProject(options.cwd);
  // Before the port and the watchers; writing the lock checks again, for a server that raced us.
  assertNoDevServer(project.root);
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
  const embed = {
    playerScript: await playerScript(),
    liveReloadScript: liveReloadScript(),
  };

  // Rendered pages, kept until an edit changes what they show.
  const pages = new Map<string, string>();
  const rooms = createRooms<RoomClient>(() => watch.project().decks);
  const watch = createProjectWatch({
    root: options.cwd,
    project,
    ...(scopedDeckName ? { scopedDeckName } : {}),
    visual: options.visual === true,
    ...(options.visualRunner ? { visualRunner: options.visualRunner } : {}),
    pollIntervalMs: options.pollIntervalMs ?? POLL_INTERVAL_MS,
    onChange: () => {
      pages.clear();
      // A script edit may have removed the slide or beat a room stood at.
      rooms.reclamp();
    },
  });

  const cached = (key: string, render: () => string): string => {
    const hit = pages.get(key);
    if (hit !== undefined) {
      return hit;
    }
    const html = render();
    pages.set(key, html);
    return html;
  };

  const deckPage = (dir: string, mode: "player" | "presenter"): Response => {
    try {
      return htmlResponse(
        cached(`${dir}:${mode}`, () =>
          renderDeckHtml(dir, {
            playerScript: embed.playerScript,
            target: {
              kind: "dev",
              mode,
              includeNotes: mode === "presenter" || !remote,
              liveReloadScript: embed.liveReloadScript,
              ...(mode === "presenter" && password ? { liveToken: password } : {}),
            },
          }),
        ),
      );
    } catch (error) {
      return htmlResponse(errorPage(error), 500);
    }
  };

  const indexPage = (): Response =>
    htmlResponse(
      cached("index", () => {
        const { decks, failed } = watch.project();
        return renderIndexHtml(
          decks.map((deck) => ({ name: deck.name, title: deck.deck.title })),
          failed.map((entry) => ({ name: entry.name })),
        );
      }),
    );

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
        const routed = routeRequest(req, {
          ...(scopedDeckName ? { scopedDeckName } : {}),
          ...(deckDir ? { deckDir } : {}),
          project: watch.project,
          hub: watch.hub,
          rooms,
          deckPage,
          indexPage,
          upgrade: (request, data) => bunServer.upgrade(request, { data }),
        });
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
          rooms.join(ws.data.room, ws);
        },
        message(ws, message) {
          if (!ws.data.control) {
            return;
          }
          const payload = typeof message === "string" ? message : new TextDecoder().decode(message);
          rooms.move(ws.data.room, ws, payload);
        },
        close(ws) {
          rooms.leave(ws.data.room, ws);
        },
      },
    });

  let server: ReturnType<typeof listen>;
  try {
    server = listen();
  } catch (error) {
    watch.close();
    throw listenError(error, options.port);
  }

  const port = server.port ?? 0;
  const url = `http://127.0.0.1:${port}/`;
  const remoteUrls = [...new Set([url, ...(remote ? lanUrls(port) : [])])];
  try {
    writeDevServerLock(project.root, url, password, scopedDeckName);
  } catch (error) {
    watch.close();
    await server.stop(true);
    throw error;
  }

  return {
    url,
    listenHostname,
    remoteUrls,
    ...(deckDir ? { deckDir } : {}),
    decks: project.decks.map((deck) => deck.name),
    events: { listen: watch.hub.listen },
    ...(pairings ? { pair: () => pairings.issue() } : {}),
    async close() {
      removeDevServerLock(project.root);
      // Connections first: Bun never finishes stopping once two or more SSE streams were closed.
      await server.stop(true);
      watch.close();
    },
  };
}

function listenError(error: unknown, port: number | undefined): unknown {
  if (port && (error as { code?: string } | null)?.code === "EADDRINUSE") {
    return new DekError(`port ${port} is already in use`, {
      hint: "pass another --port, or omit it to let the OS choose",
    });
  }
  return error;
}
