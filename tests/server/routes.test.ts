import { describe, expect, test } from "bun:test";
import type { Project } from "../../src/core/resolve.ts";
import { createEventHub } from "../../src/server/hub.ts";
import { createRooms, type RoomClient } from "../../src/server/rooms.ts";
import { type RouteContext, renderIndexHtml, routeRequest } from "../../src/server/routes.ts";

function context(scopedDeckName?: string): RouteContext {
  const project = { decks: [{ name: "talk", dir: "/p/decks/talk" }], failed: [] };
  return {
    ...(scopedDeckName ? { scopedDeckName, deckDir: `/p/decks/${scopedDeckName}` } : {}),
    project: () => project as unknown as Project,
    hub: createEventHub(),
    rooms: createRooms<RoomClient>(() => []),
    deckPage: () => new Response("page"),
    indexPage: () => new Response("index"),
    upgrade: () => false,
  };
}

const routeOf = (path: string, scoped?: string): string =>
  routeRequest(new Request(`http://127.0.0.1${path}`), context(scoped)).route;

describe("routeRequest", () => {
  test("names each deck route under the deck's prefix", () => {
    expect(routeOf("/")).toBe("index");
    expect(routeOf("/decks/talk")).toBe("player");
    expect(routeOf("/decks/talk/presenter/")).toBe("presenter");
    expect(routeOf("/decks/talk/events")).toBe("events");
    expect(routeOf("/decks/talk/ws")).toBe("socket");
    expect(routeOf("/decks/talk/voice/audio.wav")).toBe("voice");
    expect(routeOf("/decks/talk/goto")).toBe("control");
    expect(routeOf("/decks/talk/marks")).toBe("marks");
    expect(routeOf("/decks/nope/")).toBe("missing");
  });

  test("streams events per deck only, never project-wide", () => {
    expect(routeOf("/events")).toBe("missing");
    expect(routeOf("/events", "talk")).toBe("events");
    expect(routeOf("/decks/talk/events", "talk")).toBe("events");
  });

  test("a server scoped to one deck serves its routes at the root, and no other deck", () => {
    expect(routeOf("/", "talk")).toBe("player");
    expect(routeOf("/presenter", "talk")).toBe("presenter");
    expect(routeOf("/decks/other/theme", "talk")).toBe("missing");
  });
});

describe("the goto route", () => {
  // `dekc goto` checks its own arguments; the server answers the request, not a command line.
  test("says a request without a slug names none, not how to type a command", async () => {
    const req = new Request("http://127.0.0.1/decks/talk/goto", { method: "POST", body: "{}" });
    const response = await routeRequest(req, context()).respond("presenter");
    expect(response?.status).toBe(400);
    expect(await response?.json()).toEqual({
      ok: false,
      error: { message: 'the request names no slide: send {"slug": "<slug>"}' },
    });
  });
});

describe("renderIndexHtml", () => {
  test("links each deck", () => {
    const html = renderIndexHtml([{ name: "demo", title: "Demo" }]);
    expect(html).toContain('href="/decks/demo/"');
    // A phone paired from the deck list opens a presenter view from here.
    expect(html).toContain('href="/decks/demo/presenter"');
    expect(html).toContain("demo");
    expect(html).toContain('<html lang="en">');
  });

  test("lists failed decks", () => {
    const html = renderIndexHtml([{ name: "demo", title: "Demo" }], [{ name: "orphan" }]);
    expect(html).toContain("orphan");
    expect(html).toContain("failed");
  });
});
