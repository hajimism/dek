import { afterEach, describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EmbedMessage } from "../../src/core/embed-protocol.ts";
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

const script = `---
title: Demo
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

async function mountFramed(options: { framed?: boolean; url?: string } = {}) {
  root = realpathSync(await mkdtemp(join(tmpdir(), "dek-embed-")));
  await writeProject(root, {
    decks: [
      {
        name: "demo",
        script,
        slides: {
          intro: slideDocument(`<section class="slide"><h2 class="lead">intro</h2></section>`),
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
    "says it is ready with its slides and where it stands, and nothing of the script",
    async () => {
      const page = await mountFramed({ url: "file:///deck.html#plan/1" });
      expect(page.messages()).toEqual([
        {
          type: "dek:ready",
          protocol: 1,
          deck: "demo",
          size: { width: 1280, height: 720 },
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
    "goes where the framing page says, as a move of its own, and says where it went",
    async () => {
      const page = await mountFramed();
      const peer = new BroadcastChannel(playerChannelName());
      const heard: unknown[] = [];
      peer.addEventListener("message", (event) => heard.push(event.data));
      try {
        page.send({ type: "dek:goto", slug: "plan", step: "chart" });
        await settle();
        await settle();
        expect(currentSlug()).toBe("plan");
        expect(location.hash).toBe("#plan/1");
        expect(page.messages().at(-1)).toEqual({
          type: "dek:moved",
          slug: "plan",
          step: "chart",
          index: 1,
        });
        // Another window of the deck follows it, as it follows a key press.
        expect(heard.map((data) => JSON.parse(String(data)))).toEqual([
          { slideIndex: 1, beatIndex: 1 },
        ]);
      } finally {
        peer.close();
      }
    },
  );

  test.serial("says where it went whatever moved it, and answers when asked", async () => {
    const page = await mountFramed();
    pressKey("ArrowRight");
    await settle();
    expect(page.messages().at(-1)).toEqual({
      type: "dek:moved",
      slug: "plan",
      step: "0",
      index: 1,
    });
    const count = page.posted.length;
    page.send({ type: "dek:current" });
    expect(page.posted.length).toBe(count + 1);
    expect(page.messages().at(-1)).toEqual({
      type: "dek:moved",
      slug: "plan",
      step: "0",
      index: 1,
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

  test.serial("picks until told to stop, and says so when Escape cancels", async () => {
    const page = await mountFramed();
    const layer = () => shadow()?.querySelector<HTMLElement>("[data-part=layer]");
    expect(layer()?.hidden).toBe(true);
    page.send({ type: "dek:pick", on: true });
    expect(layer()?.hidden).toBe(false);
    page.send({ type: "dek:pick", on: false });
    expect(layer()?.hidden).toBe(true);

    page.send({ type: "dek:pick", on: true });
    expect(pressKey("Escape")).toBe(true);
    expect(layer()?.hidden).toBe(true);
    expect(page.messages().at(-1)).toEqual({ type: "dek:pick-cancel" });
    // Escape outside pick mode is not the embed API's.
    const count = page.posted.length;
    pressKey("Escape");
    expect(page.posted.length).toBe(count);
  });

  test.serial("a deck nobody frames has no embed API", async () => {
    await mountFramed({ framed: false });
    expect(document.getElementById("dek-embed")).toBeNull();
  });
});
