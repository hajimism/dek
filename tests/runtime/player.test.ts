import { describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { livePlayerScript, liveReloadScript, playerScript } from "../../src/runtime/player.ts";

const script = await playerScript();
const live = await livePlayerScript();

/** What only a page served by the dev server reaches for: its socket, routes, and live hook. */
const DEV_SERVER_ONLY = ["WebSocket", '"/ws"', '"/marks"', "/voice/", "dekLive"];

describe("playerScript", () => {
  test("compiles lazily and caches the result", async () => {
    const source = await Bun.file(new URL("../../src/runtime/player.ts", import.meta.url)).text();
    expect(source).toContain("player ??=");
    expect(source).toContain("livePlayer ??=");
    expect(source).toContain("annotate ??=");
    expect(source).not.toMatch(/= await compile\(/);
    expect(await playerScript()).toBe(script);
    expect(await livePlayerScript()).toBe(live);
  });

  test.each(DEV_SERVER_ONLY)("leaves %s out of a file that stands alone", (needle) => {
    expect(script).not.toContain(needle);
  });

  test.each(DEV_SERVER_ONLY)("keeps %s on the dev server's pages", (needle) => {
    expect(live).toContain(needle);
  });
});

describe("liveReloadScript", () => {
  test("listens for SSE without reloading on every event", () => {
    const live = liveReloadScript();
    expect(live).toContain("EventSource");
    expect(live).toContain("dekLive");
    expect(live).not.toMatch(/onmessage = \(\) => location\.reload\(\)/);
  });

  // Serial: each row registers happy-dom over the same globals.
  test.serial.each([
    [
      "the presenter's token",
      "/decks/demo/presenter",
      "a b&c",
      "/decks/demo/events?token=a%20b%26c",
    ],
    ["no token on an audience page", "/decks/demo/", undefined, "/decks/demo/events"],
    ["a server scoped to the deck", "/presenter", undefined, "/events"],
  ])("opens its deck's stream with %s", async (_, path, token, url) => {
    GlobalRegistrator.register({ url: `http://localhost:3000${path}` });
    try {
      const opened: string[] = [];
      (globalThis as { EventSource: unknown }).EventSource = class {
        constructor(url: string) {
          opened.push(url);
        }
      };
      if (token !== undefined) {
        document.body.dataset.liveToken = token;
      }
      // biome-ignore lint/security/noGlobalEval: the script must see happy-dom globals
      // biome-ignore lint/complexity/noCommaOperator: indirect eval
      (0, eval)(liveReloadScript());
      expect(opened).toEqual([url]);
    } finally {
      await GlobalRegistrator.unregister();
    }
  });
});
