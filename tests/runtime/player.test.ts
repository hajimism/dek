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

  test("handles backward navigation keys", () => {
    expect(script).toContain("ArrowLeft");
  });

  test("keeps the current position in the location hash", () => {
    expect(script).toContain("location.hash");
    expect(script).toContain("hashchange");
  });

  test("updates the presenter section budget", () => {
    expect(script).toContain("dek-budget");
  });

  test("scopes live websocket URLs to the current deck path", () => {
    expect(script).toContain("/decks/");
    expect(script).toContain("token");
  });

  test("looks up the current slide by data-slug", () => {
    expect(script).toContain("data-slug");
  });

  test("applies morph names on the current slide only", () => {
    expect(script).not.toContain('document.querySelectorAll("[data-morph]")');
    expect(script).toContain("querySelectorAll");
    expect(script).toContain("data-morph");
  });

  test("starts the elapsed timer when a websocket position arrives", () => {
    expect(script).not.toMatch(/addEventListener\("message",\([^)]*\)=>\{o=JSON\.parse/);
  });

  test("scales the deck to the viewport on resize", () => {
    expect(script).toContain("resize");
    expect(script).toContain("transform");
  });

  test("patches live slides through dekLive instead of a full reload", () => {
    expect(script).toContain("dekLive");
    expect(script).toContain("/slide/");
    expect(script).toContain("fetch");
  });

  test("loads a Timeline when the page is in rehearse mode", () => {
    expect(script).toContain("rehearse");
    expect(script).toContain("timeline.json");
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
