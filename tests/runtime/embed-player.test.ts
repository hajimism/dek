import { afterEach, describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EmbedMessage } from "../../src/core/embed-protocol.ts";
import { encodePosition } from "../../src/core/live-protocol.ts";
import {
  currentSlug,
  mountPlayer,
  playerChannelName,
  pressKey,
  settle,
  unmountPlayer,
} from "../helpers/dom.ts";
import { slideDocument } from "../helpers/html.ts";
import { writeProject } from "../helpers/project.ts";

// 4:3, so the size dek:ready names is the page's own and not the default a measure falls back on.
const script = `---
title: Demo
ratio: "4:3"
---

## intro

秘密の台本はここ。

## plan

計画を話す。

### chart {#chart}

グラフを見せる。
`;

/** The page that frames the deck: what the deck posts to it, and how it posts to the deck. */
function fakeParent() {
  const posted: Array<{ message: EmbedMessage; targetOrigin: string }> = [];
  const parent = {
    postMessage(message: EmbedMessage, targetOrigin: string) {
      posted.push({ message: structuredClone(message), targetOrigin });
    },
  };
  return {
    parent,
    posted,
    messages: () => posted.map((each) => each.message),
    /** Post `data` to the deck as the framing page does, or as `source` when another sends it. */
    send(data: unknown, source: unknown = parent) {
      window.dispatchEvent(new MessageEvent("message", { data, source: source as Window }));
    },
  };
}

let root = "";

async function mountFramed(
  options: { framed?: boolean; url?: string; beforeStart?: () => void } = {},
) {
  root = realpathSync(await mkdtemp(join(tmpdir(), "dek-embed-")));
  await writeProject(root, {
    decks: [
      {
        name: "demo",
        script,
        slides: {
          intro: slideDocument(
            `<section class="slide"><h2 class="lead">intro</h2><input aria-label="note"></section>`,
          ),
          plan: slideDocument(
            `<section class="slide"><h2>plan</h2><div class="chart" data-step="chart">chart</div></section>`,
          ),
        },
      },
    ],
  });
  const page = fakeParent();
  await mountPlayer(join(root, "decks", "demo"), {
    url: options.url ?? "file:///deck.html",
    beforeStart: () => {
      if (options.framed !== false) {
        Object.defineProperty(window, "parent", { value: page.parent, configurable: true });
      }
      options.beforeStart?.();
    },
  });
  return page;
}

afterEach(async () => {
  await unmountPlayer();
  await rm(root, { recursive: true, force: true });
});

const shadow = (): ShadowRoot | null | undefined =>
  document.getElementById("dek-embed")?.shadowRoot;

describe("a framed deck's embed API", () => {
  test.serial(
    "says it is ready with its slides, its size, and where it stands, and nothing of the script",
    async () => {
      const page = await mountFramed({ url: "file:///deck.html#plan/1" });
      // The script is in the page, for its presenter view; none of it is sent.
      expect(document.getElementById("dek-data")?.textContent).toContain("秘密");
      expect(page.messages()).toEqual([
        {
          type: "dek:ready",
          protocol: 1,
          deck: "demo",
          size: { width: 1024, height: 768 },
          slides: [
            { slug: "intro", steps: ["0"] },
            { slug: "plan", steps: ["0", "chart"] },
          ],
          current: { slug: "plan", step: "chart", index: 1 },
        },
      ]);
      expect(page.posted.map((each) => each.targetOrigin)).toEqual(["*"]);
      expect(JSON.stringify(page.messages())).not.toContain("秘密");
    },
  );

  test.serial(
    "goes where the framing page says, keeping it off the channel and the history",
    async () => {
      const page = await mountFramed();
      const peer = new BroadcastChannel(playerChannelName());
      const heard: unknown[] = [];
      peer.addEventListener("message", (event) => heard.push(event.data));
      const entries = history.length;
      try {
        page.send({ type: "dek:goto", slug: "plan", step: "chart" });
        await settle();
        await settle();
        expect(currentSlug()).toBe("plan");
        expect(location.hash).toBe("#plan/1");
        expect(history.length).toBe(entries);
        expect(page.messages().at(-1)).toEqual({
          type: "dek:moved",
          slug: "plan",
          step: "chart",
          index: 1,
          by: "embed",
        });
        // Another frame of the deck under the same page is the framing page's to move.
        expect(heard).toEqual([]);
      } finally {
        peer.close();
      }
    },
  );

  test.serial("says where the reader moved it, by a key, the hash, or another window", async () => {
    const page = await mountFramed();
    const entries = history.length;
    pressKey("ArrowRight");
    await settle();
    expect(page.messages().at(-1)).toEqual({
      type: "dek:moved",
      slug: "plan",
      step: "0",
      index: 1,
      by: "reader",
    });
    // A framed deck's moves replace its history entry: the history is the framing page's.
    expect(history.length).toBe(entries);

    location.hash = "#intro";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await settle();
    expect(page.messages().at(-1)).toEqual({
      type: "dek:moved",
      slug: "intro",
      step: "0",
      index: 0,
      by: "reader",
    });

    const peer = new BroadcastChannel(playerChannelName());
    try {
      peer.postMessage(encodePosition({ slideIndex: 1, beatIndex: 1 }));
      await Bun.sleep(20);
      await settle();
      expect(page.messages().at(-1)).toEqual({
        type: "dek:moved",
        slug: "plan",
        step: "chart",
        index: 1,
        by: "reader",
      });
    } finally {
      peer.close();
    }
  });

  test.serial("answers where it stands when asked", async () => {
    const page = await mountFramed();
    const count = page.posted.length;
    page.send({ type: "dek:current" });
    expect(page.posted.length).toBe(count + 1);
    expect(page.messages().at(-1)).toEqual({
      type: "dek:moved",
      slug: "intro",
      step: "0",
      index: 0,
      by: "embed",
    });
  });

  test.serial(
    "ignores a slide or step it lacks, anything malformed, and any page but its parent",
    async () => {
      const page = await mountFramed();
      const count = page.posted.length;
      page.send({ type: "dek:goto", slug: "gone" });
      page.send({ type: "dek:goto", slug: "plan", step: "9" });
      page.send({ type: "dek:goto", slug: "plan", extra: true });
      page.send("dek:current");
      page.send({ type: "dek:current" }, window);
      page.send({ type: "dek:goto", slug: "plan" }, {});
      await settle();
      expect(currentSlug()).toBe("intro");
      expect(page.posted.length).toBe(count);
    },
  );

  test.serial(
    "draws a numbered pin for each mark on the slide shown, and says which was clicked",
    async () => {
      const page = await mountFramed();
      const box = { x: 100, y: 50, width: 200, height: 40 };
      page.send({
        type: "dek:marks",
        marks: [
          { id: "c_1", number: 1, slug: "intro", step: "0", box },
          { id: "c_2", number: 2, slug: "plan", step: "chart", box },
        ],
      });
      const pins = () => [...(shadow()?.querySelectorAll<HTMLElement>("[data-part=pin]") ?? [])];
      expect(pins().map((pin) => pin.textContent)).toEqual(["1"]);
      pins()[0]?.click();
      expect(page.messages().at(-1)).toEqual({ type: "dek:mark", id: "c_1" });
      expect(currentSlug()).toBe("intro");

      page.send({ type: "dek:goto", slug: "plan" });
      await settle();
      expect(pins().map((pin) => pin.textContent)).toEqual(["2"]);
      page.send({ type: "dek:marks", marks: [] });
      expect(pins()).toEqual([]);
    },
  );

  test.serial("keeps the marks it had, and moving, when a list of marks has a hole", async () => {
    const page = await mountFramed();
    const box = { x: 100, y: 50, width: 200, height: 40 };
    const mark = { id: "c_1", number: 1, slug: "intro", step: "0", box };
    page.send({ type: "dek:marks", marks: [mark] });
    const sparse = [mark, mark];
    delete sparse[0];
    page.send(structuredClone({ type: "dek:marks", marks: sparse }));
    const pins = () => [...(shadow()?.querySelectorAll<HTMLElement>("[data-part=pin]") ?? [])];
    expect(pins().map((pin) => pin.textContent)).toEqual(["1"]);
    pressKey("ArrowRight");
    await settle();
    expect(page.messages().at(-1)).toMatchObject({ type: "dek:moved", slug: "plan" });
  });

  test.serial("picks until told to stop, and says so when Escape cancels", async () => {
    const page = await mountFramed();
    const layer = () => shadow()?.querySelector<HTMLElement>("[data-part=layer]");
    expect(layer()?.hidden).toBe(true);
    page.send({ type: "dek:pick", on: true });
    expect(layer()?.hidden).toBe(false);
    page.send({ type: "dek:pick", on: false });
    expect(layer()?.hidden).toBe(true);

    page.send({ type: "dek:pick", on: true });
    // Escape typed into a field on a slide is the field's.
    const count = page.posted.length;
    const field = document.querySelector("#deck input");
    expect(field).not.toBeNull();
    pressKey("Escape", {}, field as Element);
    expect(layer()?.hidden).toBe(false);
    expect(page.posted.length).toBe(count);

    expect(pressKey("Escape")).toBe(true);
    expect(layer()?.hidden).toBe(true);
    expect(page.messages().at(-1)).toEqual({ type: "dek:pick-cancel" });
    // Escape outside pick mode is not the embed API's.
    const after = page.posted.length;
    pressKey("Escape");
    expect(page.posted.length).toBe(after);
  });

  test.serial(
    "passes c to the framing page, unless a field, the browser or a plugin has it",
    async () => {
      const page = await mountFramed();
      const keys = () => page.messages().filter((message) => message.type === "dek:key");
      pressKey("c");
      expect(keys()).toEqual([{ type: "dek:key", key: "c" }]);
      pressKey("C", { shiftKey: true });
      expect(keys()).toHaveLength(2);
      pressKey("c", { metaKey: true });
      pressKey("c", { repeat: true });
      pressKey("c", {}, document.querySelector("#deck input") as Element);
      expect(keys()).toHaveLength(2);
      // A plugin that takes c prevents the key's default, and keeps it.
      const plugin = (event: KeyboardEvent) => event.preventDefault();
      document.addEventListener("keydown", plugin);
      pressKey("c");
      document.removeEventListener("keydown", plugin);
      expect(keys()).toHaveLength(2);
    },
  );

  test.serial(
    "shows the slide alone: no rail and no key hint, whatever the reader kept",
    async () => {
      await mountFramed({ beforeStart: () => localStorage.setItem("dek.railVisible", "1") });
      expect(document.body.classList.contains("is-rail-hidden")).toBe(true);
      expect(document.getElementById("dek-hint")).toBeNull();
      // The keys still open the rail; what the reader kept for the deck on its own stays as it was.
      pressKey("s");
      expect(document.body.classList.contains("is-rail-hidden")).toBe(false);
      pressKey("s");
      expect(document.body.classList.contains("is-rail-hidden")).toBe(true);
      expect(localStorage.getItem("dek.railVisible")).toBe("1");
    },
  );

  test.serial("a deck nobody frames shows its rail and its key hint as before", async () => {
    await mountFramed({ framed: false });
    expect(document.body.classList.contains("is-rail-hidden")).toBe(false);
    expect(document.getElementById("dek-hint")).not.toBeNull();
  });

  test.serial(
    "a deck nobody frames has no embed API, and keeps its history and its channel",
    async () => {
      await mountFramed({ framed: false });
      expect(document.getElementById("dek-embed")).toBeNull();
      const peer = new BroadcastChannel(playerChannelName());
      const heard: unknown[] = [];
      peer.addEventListener("message", (event) => heard.push(event.data));
      const entries = history.length;
      try {
        pressKey("ArrowRight");
        await settle();
        await Bun.sleep(20);
        expect(history.length).toBe(entries + 1);
        expect(heard).toHaveLength(1);
      } finally {
        peer.close();
      }
    },
  );
});
