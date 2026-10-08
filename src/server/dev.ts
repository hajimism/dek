import { join } from "node:path";
import { DekError } from "../core/error.ts";
import type { PlaywrightRunner } from "../core/playwright.ts";
import { locateDeck, type Project, resolveProject } from "../core/resolve.ts";
import { annotateScript, livePlayerScript, liveReloadScript } from "../runtime/player.ts";
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
import { createDevPages } from "./pages.ts";
import { createPairings, type Pairings } from "./pairing.ts";
import { createProjectWatch } from "./project-watch.ts";
import { createRooms, type RoomClient } from "./rooms.ts";
import { type RouteContext, routeRequest, type WsData } from "./routes.ts";
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

export type DevServerOptions = {
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
};

/** Who may reach the server, and how a presenter proves who they are. */
type Access = {
  remote: boolean;
  listenHostname: string;
  password: string | undefined;
  pairings: Pairings | undefined;
  /** What a paired phone's cookie carries: new on every start, so a restart ends every pairing. */
  sessionSecret: string;
};

/** What the routes read, all but the socket upgrade, which needs the listening server. */
type ServedRoutes = Omit<RouteContext, "upgrade">;

export async function startDevServer(options: DevServerOptions): Promise<DevServer> {
  const project = resolveProject(options.cwd);
  // Before the port and the watchers; writing the lock checks again, for a server that raced us.
  assertNoDevServer(project.root);
  const { scopedDeckName, deckDir } = serverScope(project, options);
  const access = accessFor(options);
  const embed = {
    playerScript: await livePlayerScript(),
    liveReloadScript: liveReloadScript(),
    annotateScript: await annotateScript(),
  };

  const pages = createDevPages({
    embed,
    remote: access.remote,
    password: access.password,
    project: () => watch.project(),
  });
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
  const routes: ServedRoutes = {
    ...(scopedDeckName ? { scopedDeckName } : {}),
    ...(deckDir ? { deckDir } : {}),
    project: watch.project,
    hub: watch.hub,
    rooms,
    deckPage: pages.deckPage,
    indexPage: pages.indexPage,
  };

  let server: Bun.Server<WsData>;
  try {
    server = listen(options.port, access, routes);
  } catch (error) {
    watch.close();
    throw listenError(error, options.port);
  }

  const port = server.port ?? 0;
  const url = `http://127.0.0.1:${port}/`;
  const remoteUrls = [...new Set([url, ...(access.remote ? lanUrls(port) : [])])];
  try {
    writeDevServerLock(project.root, url, access.password, scopedDeckName);
  } catch (error) {
    watch.close();
    await server.stop(true);
    throw error;
  }

  const { pairings } = access;
  return {
    url,
    listenHostname: access.listenHostname,
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

/** The deck the server is scoped to, by --deck or by the directory it started in, if any. */
function serverScope(
  project: Project,
  options: DevServerOptions,
): { scopedDeckName: string | undefined; deckDir: string | undefined } {
  const fromCwd = locateDeck(project.root, options.cwd);
  const scopedDeckName = options.deck ?? fromCwd?.name;
  if (options.deck) {
    assertKnownDeck(project, options.deck);
  }
  const deckDir = scopedDeckName ? join(project.root, "decks", scopedDeckName) : fromCwd?.dir;
  return { scopedDeckName, deckDir };
}

/** A deck that failed to parse is still one to serve: its page shows why. */
function assertKnownDeck(project: Project, name: string): void {
  const known =
    project.decks.some((entry) => entry.name === name) ||
    project.failed.some((entry) => entry.name === name);
  if (!known) {
    throw new DekError(`deck "${name}" not found`, {
      path: join(project.root, "decks", name),
      hint: "run `dekc ls`",
    });
  }
}

function accessFor(options: DevServerOptions): Access {
  const remote = options.remote === true;
  return {
    remote,
    listenHostname: remote ? "0.0.0.0" : "127.0.0.1",
    // An empty one would open the presenter to the LAN.
    password: remote ? options.password || generateRemotePassword() : options.password,
    pairings: remote
      ? createPairings(options.pairingTtlMs !== undefined ? { ttlMs: options.pairingTtlMs } : {})
      : undefined,
    sessionSecret: generateRemotePassword(32),
  };
}

function listen(port: number | undefined, access: Access, routes: ServedRoutes) {
  return Bun.serve<WsData>({
    hostname: access.listenHostname,
    port: port ?? 0,
    // Never Bun's development error page: it shows the source and absolute paths to anyone.
    development: false,
    fetch: (req, server) => answer(req, server, access, routes),
    error(error) {
      console.error(error);
      return new Response("Internal Server Error\n", { status: 500 });
    },
    websocket: roomSockets(routes.rooms),
  });
}

/** Refuse what the guard refuses, redeem a pairing code, then route what the request may read. */
function answer(req: Request, server: Bun.Server<WsData>, access: Access, routes: ServedRoutes) {
  const refused = requestGuard(req, { remote: access.remote });
  if (refused) {
    return refused;
  }
  // Per port: a phone may pair with two dek servers on one machine.
  const session = { name: `dek-presenter-${server.port}`, secret: access.sessionSecret };
  const { pairings } = access;
  const code = pairings && new URL(req.url).searchParams.get("pair");
  if (pairings && typeof code === "string") {
    return pairingResponse(new URL(req.url), pairings.redeem(code), session);
  }
  const routed = routeRequest(req, {
    ...routes,
    upgrade: (request, data) => server.upgrade(request, { data }),
  });
  const seen = clearance(req, access.password, access.remote ? session : undefined);
  if (!mayRead(seen, ROUTE_EXPOSURE[routed.route])) {
    return unauthorized();
  }
  return routed.respond(seen);
}

/** Each socket joins its deck's room; only a presenter's socket may move it or point in it. */
function roomSockets(rooms: RouteContext["rooms"]): Bun.WebSocketHandler<WsData> {
  return {
    // A position or a point is a few dozen bytes; anything near this is neither.
    maxPayloadLength: 4 * 1024,
    open(ws) {
      rooms.join(ws.data.room, ws);
    },
    message(ws, message) {
      if (!ws.data.control) {
        return;
      }
      const payload = typeof message === "string" ? message : new TextDecoder().decode(message);
      rooms.relay(ws.data.room, ws, payload);
    },
    close(ws) {
      rooms.leave(ws.data.room, ws);
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
