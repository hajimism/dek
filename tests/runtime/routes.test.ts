import { describe, expect, test } from "bun:test";
import {
  type DeckRoute,
  deckUrl,
  formatDeckRoute,
  parseDeckRoute,
  splitDeckPath,
} from "../../src/runtime/routes.ts";

describe("deck routes", () => {
  const routes: DeckRoute[] = [
    { kind: "player" },
    { kind: "presenter" },
    { kind: "socket" },
    { kind: "events" },
    { kind: "theme" },
    { kind: "slide", slug: "intro" },
    { kind: "slide", slug: "a b/c" },
    { kind: "voice", file: "timeline.json" },
    { kind: "voice", file: "audio.wav" },
    { kind: "current" },
    { kind: "goto" },
    { kind: "asset", path: "img/logo.png" },
  ];

  test.each(routes.map((route) => [route.kind, route] as const))(
    "reads back the %s path it writes",
    (_, route) => {
      expect(parseDeckRoute(formatDeckRoute(route))).toEqual(route);
    },
  );

  test("takes a trailing slash on a fixed path", () => {
    expect(parseDeckRoute("/presenter/")).toEqual({ kind: "presenter" });
    expect(parseDeckRoute("/events/")).toEqual({ kind: "events" });
    expect(parseDeckRoute("")).toEqual({ kind: "player" });
  });

  test("names no route for anything else", () => {
    expect(parseDeckRoute("/voice/secret.txt")).toBeUndefined();
    expect(parseDeckRoute("/slide/")).toBeUndefined();
    expect(parseDeckRoute("/slide/a/b")).toBeUndefined();
    expect(parseDeckRoute("/nope")).toBeUndefined();
  });

  test("a page's route sits under its deck, or at the root of a scoped server", () => {
    expect(deckUrl("/decks/talk/presenter", { kind: "events" })).toBe("/decks/talk/events");
    expect(deckUrl("/presenter", { kind: "events" })).toBe("/events");
    expect(deckUrl("/decks/talk/", { kind: "slide", slug: "a b" })).toBe("/decks/talk/slide/a%20b");
  });

  test("splits a deck path with its name decoded", () => {
    expect(splitDeckPath("/decks/my%20talk/events")).toEqual({
      deckName: "my talk",
      rest: "/events",
    });
    expect(splitDeckPath("/events", "talk")).toEqual({ deckName: "talk", rest: "/events" });
    expect(splitDeckPath("/decks/other/events", "talk")).toBeUndefined();
    expect(splitDeckPath("/events")).toBeUndefined();
  });
});
