import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodePointer, type PointerMessage } from "../../src/core/live-protocol.ts";
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
import { waitFor } from "../helpers/wait.ts";

const script = `---
title: Laser
---

## pointed

here

## after

there
`;

let root = "";

beforeAll(async () => {
  root = realpathSync(await mkdtemp(join(tmpdir(), "dek-")));
  await writeProject(root, {
    decks: [
      {
        name: "laser",
        script,
        slides: {
          pointed: slideDocument(`<section class="slide"><h2>pointed</h2></section>`),
          after: slideDocument(`<section class="slide"><h2>after</h2></section>`),
        },
      },
    ],
  });
  await mountPlayer(join(root, "decks", "laser"));
  // happy-dom lays nothing out; the slide stands where a 1280×720 window would show it.
  const deck = document.getElementById("deck") as HTMLElement;
  deck.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720 }) as DOMRect;
});

afterAll(async () => {
  await unmountPlayer();
  await rm(root, { recursive: true, force: true });
});

const stage = (): HTMLElement => document.getElementById("dek-current-stage") as HTMLElement;
const dot = (): HTMLElement | null => document.getElementById("dek-laser");
const toggle = (): HTMLElement | null => document.getElementById("dek-laser-toggle");

function pointer(type: string, x: number, y: number, pointerType = "mouse"): void {
  stage().dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      pointerType,
      pointerId: 1,
      button: 0,
      bubbles: true,
    }),
  );
}

/** A second window of the deck, as a test plays it: what it hears, and a way to post. */
function peer() {
  const channel = new BroadcastChannel(playerChannelName());
  const heard: PointerMessage[] = [];
  channel.addEventListener("message", (event: MessageEvent) => {
    const laser = decodePointer(event.data);
    if (laser) {
      heard.push(laser);
    }
  });
  return { channel, heard };
}

describe("the laser pointer", () => {
  test.serial("is off until `l`, and says so on its button", () => {
    expect(document.body.classList.contains("is-laser")).toBe(false);
    expect(toggle()?.getAttribute("aria-pressed")).toBe("false");
    expect(pressKey("l")).toBe(true);
    expect(document.body.classList.contains("is-laser")).toBe(true);
    expect(toggle()?.getAttribute("aria-pressed")).toBe("true");
  });

  test.serial("shows where it points here, and tells the deck's other windows", async () => {
    const { channel, heard } = peer();
    try {
      pointer("pointermove", 640, 180);
      await waitFor(() => heard.length > 0);
      expect(heard[0]).toEqual({ pointer: { slideIndex: 0, x: 0.5, y: 0.25 } });
      expect(dot()?.hidden).toBe(false);
      expect(dot()?.style.left).toBe("50%");
      expect(dot()?.style.top).toBe("25%");

      pointer("pointerleave", 2000, 2000);
      await waitFor(() => heard.length > 1);
      expect(heard[1]).toEqual({ pointer: null });
      expect(dot()?.hidden).toBe(true);
    } finally {
      channel.close();
    }
  });

  test.serial("takes a click on the slide for pointing, not for moving on", async () => {
    pointer("pointerdown", 900, 300);
    pointer("pointerup", 900, 300);
    await settle();
    expect(currentSlug()).toBe("pointed");
  });

  test.serial("draws where another window points, laser on here or not", async () => {
    pressKey("l");
    expect(document.body.classList.contains("is-laser")).toBe(false);
    const { channel } = peer();
    try {
      channel.postMessage({ pointer: { slideIndex: 0, x: 0.1, y: 0.9 } });
      await waitFor(() => dot()?.hidden === false);
      expect(dot()?.style.left).toBe("10%");
      channel.postMessage({ pointer: null });
      await waitFor(() => dot()?.hidden === true);
    } finally {
      channel.close();
    }
  });

  test.serial("takes the dot away when the deck moves off the slide it was made on", async () => {
    const { channel } = peer();
    try {
      channel.postMessage({ pointer: { slideIndex: 0, x: 0.5, y: 0.5 } });
      await waitFor(() => dot()?.hidden === false);
      pressKey("ArrowRight");
      await waitFor(() => currentSlug() === "after");
      expect(dot()?.hidden).toBe(true);
    } finally {
      channel.close();
    }
  });

  test.serial("turns off from its button too, telling the others it went away", async () => {
    toggle()?.click();
    expect(document.body.classList.contains("is-laser")).toBe(true);
    const { channel, heard } = peer();
    try {
      pointer("pointermove", 320, 360);
      await waitFor(() => heard.length > 0);
      toggle()?.click();
      await waitFor(() => heard.length > 1);
      expect(heard.map((message) => message.pointer)).toEqual([
        { slideIndex: 1, x: 0.25, y: 0.5 },
        null,
      ]);
      expect(document.body.classList.contains("is-laser")).toBe(false);
    } finally {
      channel.close();
    }
  });
});
