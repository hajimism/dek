import { afterEach, describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginPage } from "../../src/core/plugin.ts";
import { dekGo, dekLive, mountPlayer, pressKey, settle, unmountPlayer } from "../helpers/dom.ts";
import { writeProject } from "../helpers/project.ts";

const script = `---
title: Plan
lang: en
---

## cover

hi

## plan

### base {#base}

one
`;

const slides = {
  cover: '<section class="slide"><h1>Hi</h1></section>',
  plan: '<section class="slide"><h1>Plan</h1><p data-step="base">one</p></section>',
};

type Events = Array<[string, unknown]>;

/** A page that records what the API tells it on window.__events. */
const recorder = (name = "study", api = 1) => `
  window.__events = [];
  dek.plugin(${JSON.stringify(name)}, { api: ${api} }, (api) => {
    window.__api = api;
    __events.push(["setup", { deck: api.deck, slides: api.slides, current: api.current() }]);
    api.on("change", (position) => __events.push(["change", position]));
    api.on("mount", ({ slug, root, layer, view }) => {
      layer.innerHTML = "<i>sticker</i>";
      __events.push(["mount", { slug, root: root.dataset.slug, view, layer: layer instanceof ShadowRoot }]);
    });
    api.key("r", () => __events.push(["key", "r"]));
  });
`;

const page = (overrides: Partial<PluginPage> = {}): PluginPage => ({
  name: "study",
  keys: ["r"],
  script: recorder(),
  data: { "study.yaml": { text: "version: 1\n", version: "abc" } },
  ...overrides,
});

let dir: string | undefined;

async function mount(plugins: PluginPage[]): Promise<Events> {
  dir = realpathSync(await mkdtemp(join(tmpdir(), "dek-plugin-player-")));
  await writeProject(dir, { decks: [{ name: "plan", script, slides }] });
  await mountPlayer(join(dir, "decks", "plan"), { plugins });
  await settle();
  return (window as unknown as { __events: Events }).__events;
}

afterEach(async () => {
  await unmountPlayer();
  if (dir) {
    await rm(dir, { recursive: true, force: true });
    dir = undefined;
  }
});

describe("page API 1", () => {
  test.serial(
    "sets a plugin up with the deck, mounts each slide, and says where the deck stands",
    async () => {
      const events = await mount([page()]);
      expect(events).toEqual([
        [
          "setup",
          {
            deck: { name: "plan" },
            slides: [
              { slug: "cover", title: "cover" },
              { slug: "plan", title: "plan" },
            ],
            current: { slug: "cover", index: 0, beat: 0 },
          },
        ],
        ["mount", { slug: "cover", root: "cover", view: "stage", layer: true }],
        ["mount", { slug: "plan", root: "plan", view: "stage", layer: true }],
        ["change", { slug: "cover", index: 0, beat: 0 }],
      ]);
    },
  );

  test.serial("says where the deck settled after each move, beats included", async () => {
    const events = await mount([page()]);
    events.length = 0;
    await dekGo({ slideIndex: 1, beatIndex: 1 });
    await settle();
    expect(events).toEqual([["change", { slug: "plan", index: 1, beat: 1 }]]);
  });

  test.serial(
    "shows only the current slide's layer, and never in a slide's own markup",
    async () => {
      await mount([page()]);
      const layers = () =>
        [...document.querySelectorAll<HTMLElement>("#deck > .dek-plugin-layer")].map((el) => [
          el.dataset.slug,
          el.style.display,
        ]);
      expect(layers()).toEqual([
        ["cover", "block"],
        ["plan", "none"],
      ]);
      await dekGo({ slideIndex: 1, beatIndex: 0 });
      expect(layers()).toEqual([
        ["cover", "none"],
        ["plan", "block"],
      ]);
      expect(document.querySelector(".slide .dek-plugin-layer")).toBeNull();
    },
  );

  test.serial("tells whether an element shows at the current beat", async () => {
    await mount([page()]);
    const api = (window as unknown as { __api: { shown(el: Element): boolean } }).__api;
    await dekGo({ slideIndex: 1, beatIndex: 0 });
    const step = document.querySelector('#deck > .slide[data-slug="plan"] [data-step]') as Element;
    expect(api.shown(step)).toBe(false);
    await dekGo({ slideIndex: 1, beatIndex: 1 });
    expect(api.shown(step)).toBe(true);
  });

  test.serial("gives a declared key and data file, and nothing undeclared", async () => {
    const events = await mount([page()]);
    const api = (
      window as unknown as {
        __api: { key(l: string, f: () => void): boolean; data(p: string): unknown };
      }
    ).__api;
    events.length = 0;
    expect(pressKey("r")).toBe(true);
    expect(events).toEqual([["key", "r"]]);
    expect(api.key("t", () => undefined)).toBe(false);
    expect(api.key("f", () => undefined)).toBe(false);
    expect(api.data("study.yaml")).toEqual({ text: "version: 1\n", version: "abc" });
    expect(api.data("other.yaml")).toBeNull();
  });

  test.serial(
    "keeps a plugin that throws, or asks for another API, from stopping the player",
    async () => {
      const thrower: PluginPage = {
        ...page({ name: "boom", keys: [] }),
        script: 'dek.plugin("boom", { api: 1 }, () => { throw new Error("boom"); });',
      };
      const newer = page({ name: "newer", script: recorder("newer", 2) });
      const events = await mount([thrower, newer, page()]);
      expect(events.filter(([kind]) => kind === "setup")).toHaveLength(1);
      await dekGo({ slideIndex: 1, beatIndex: 0 });
      expect(document.querySelector("#deck > .slide.is-current")?.getAttribute("data-slug")).toBe(
        "plan",
      );
    },
  );

  test.serial(
    "reads the plugins' block when a plugin asks, since the page puts it after the player",
    async () => {
      dir = realpathSync(await mkdtemp(join(tmpdir(), "dek-plugin-player-")));
      await writeProject(dir, { decks: [{ name: "plan", script, slides }] });
      // As a browser parses it: the player has started before the block exists.
      await mountPlayer(join(dir, "decks", "plan"), {
        beforeStart: () => document.getElementById("dek-plugins")?.remove(),
      });
      const block = document.createElement("script");
      block.type = "application/json";
      block.id = "dek-plugins";
      block.textContent = JSON.stringify({ study: { keys: ["r"], data: {} } });
      document.body.append(block);
      // biome-ignore lint/security/noGlobalEval: a plugin's page must see happy-dom globals
      // biome-ignore lint/complexity/noCommaOperator: indirect eval
      (0, eval)(recorder());
      const events = (window as unknown as { __events: Events }).__events;
      expect(events[0]?.[0]).toBe("setup");
    },
  );

  test.serial("refuses a plugin the page does not carry", async () => {
    await mount([page()]);
    const unknown = (window as unknown as { dek: { plugin: (...a: unknown[]) => void } }).dek;
    let called = false;
    unknown.plugin("stranger", { api: 1 }, () => {
      called = true;
    });
    expect(called).toBe(false);
  });

  test.serial("mounts a slide again after a live reload replaces it", async () => {
    dir = realpathSync(await mkdtemp(join(tmpdir(), "dek-plugin-player-")));
    await writeProject(dir, { decks: [{ name: "plan", script, slides }] });
    const realFetch = globalThis.fetch;
    // The live page talks to a dev server this test does not run; as in live-player.test.ts.
    await mountPlayer(join(dir, "decks", "plan"), {
      plugins: [page()],
      live: true,
      beforeStart: () => {
        (globalThis as { WebSocket: unknown }).WebSocket = class {
          readyState = 0;
          addEventListener(): void {}
          send(): void {}
          close(): void {}
        };
        globalThis.fetch = (async () =>
          Response.json({ ok: true, positions: [], annotations: [] })) as unknown as typeof fetch;
      },
    });
    await settle();
    const events = (window as unknown as { __events: Events }).__events;
    events.length = 0;
    globalThis.fetch = (async () =>
      new Response(
        '<section class="slide" data-slug="cover"><h1>Hello</h1></section>',
      )) as unknown as typeof fetch;
    try {
      await dekLive({ type: "reload-slide", slug: "cover" });
      await settle();
      await settle();
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(events.filter(([kind]) => kind === "mount")).toEqual([
      ["mount", { slug: "cover", root: "cover", view: "stage", layer: true }],
    ]);
  });
});
