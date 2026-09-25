import { describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { liveReloadScript, playerScript } from "../../src/runtime/player.ts";

const script = await playerScript();

describe("playerScript", () => {
  test("compiles lazily and caches the result", async () => {
    const source = await Bun.file(new URL("../../src/runtime/player.ts", import.meta.url)).text();
    expect(source).toContain("compiled ??=");
    expect(source).not.toMatch(/const compiledPlayer = await compilePlayer/);
    expect(await playerScript()).toBe(script);
  });
});

describe("liveReloadScript", () => {
  test("listens for SSE without reloading on every event", () => {
    const live = liveReloadScript();
    expect(live).toContain("EventSource");
    expect(live).toContain("dekLive");
    expect(live).not.toMatch(/onmessage = \(\) => location\.reload\(\)/);
  });

  test.each([
    ["the presenter's token", "a b&c", "/events?token=a%20b%26c"],
    ["no token on an audience page", undefined, "/events"],
  ])("opens the stream with %s", async (_, token, url) => {
    GlobalRegistrator.register({ url: "http://localhost:3000/decks/demo/presenter" });
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
