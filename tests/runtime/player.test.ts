import { describe, expect, test } from "bun:test";
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
});
