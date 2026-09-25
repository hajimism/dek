import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  currentSlug,
  dekGo,
  dekLive,
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
title: Demo
---

## intro

hello

## steps

body

### one

first

### two

second

## last

end
`;

const introHtml = slideDocument(`<section class="slide"><h2>intro</h2></section>`);
const stepsHtml = slideDocument(`<section class="slide">
  <ul>
    <li data-step="1">A</li>
    <li data-step="2">B</li>
  </ul>
</section>`);
const lastHtml = slideDocument(`<section class="slide"><h2>last</h2></section>`);

let root = "";

beforeAll(async () => {
  root = realpathSync(await mkdtemp(join(tmpdir(), "dek-")));
  await writeProject(root, {
    decks: [
      {
        name: "demo",
        script,
        slides: { intro: introHtml, steps: stepsHtml, last: lastHtml },
      },
    ],
  });
  await mountPlayer(join(root, "decks", "demo"));
});

afterAll(async () => {
  await unmountPlayer();
  await rm(root, { recursive: true, force: true });
});

describe("player runtime in happy-dom", () => {
  test.serial("marks slide 0 current and renders the page counter", () => {
    expect(currentSlug()).toBe("intro");
    expect(document.getElementById("dek-page")?.textContent?.replace(/\s+/g, " ")).toBe("1 / 3");
  });

  test.serial("shows the key hint until the first key", async () => {
    // The hash the first render writes echoes back; that is not a move.
    window.dispatchEvent(new Event("hashchange"));
    await settle();
    expect(document.getElementById("dek-hint")).not.toBeNull();
    pressKey("Shift");
    await settle();
    expect(document.getElementById("dek-hint")).toBeNull();
  });

  test.serial("ArrowRight walks beats, then slides, and writes the hash", async () => {
    pressKey("ArrowRight");
    await settle();
    expect(currentSlug()).toBe("steps");
    expect(document.querySelector('#deck [data-step="1"]')?.classList.contains("is-shown")).toBe(
      true,
    );
    expect(document.querySelector('#deck [data-step="2"]')?.classList.contains("is-shown")).toBe(
      false,
    );
    pressKey("ArrowRight");
    await settle();
    expect(document.querySelector('#deck [data-step="2"]')?.classList.contains("is-shown")).toBe(
      true,
    );
    expect(location.hash).toBe("#steps/2");
  });

  test.serial("ArrowLeft retreats one beat and rewrites the hash", async () => {
    pressKey("ArrowLeft");
    await settle();
    expect(location.hash).toBe("#steps");
    expect(document.querySelector('#deck [data-step="2"]')?.classList.contains("is-shown")).toBe(
      false,
    );
  });

  test.serial("p toggles presenter chrome and ?presenter without navigating", async () => {
    pressKey("p");
    await settle();
    expect(document.body.classList.contains("is-presenter")).toBe(true);
    expect(document.getElementById("dek-presenter")?.hidden).toBe(false);
    expect(document.getElementById("dek-script")?.textContent).toContain("body");
    expect(location.search).toContain("presenter");
    pressKey("p");
    await settle();
    expect(document.body.classList.contains("is-presenter")).toBe(false);
    expect(location.search).not.toContain("presenter");
  });

  test.serial("s hides the rail and remembers it in localStorage", async () => {
    pressKey("s");
    await settle();
    expect(document.body.classList.contains("is-rail-hidden")).toBe(true);
    expect(localStorage.getItem("dek.railVisible")).toBe("0");
    pressKey("s");
    await settle();
    expect(document.body.classList.contains("is-rail-hidden")).toBe(false);
  });

  test.serial("dekGo moves the deck and the rail's aria-current", async () => {
    await dekGo({ slideIndex: 2, beatIndex: 0 });
    expect(currentSlug()).toBe("last");
    expect(
      document.querySelector('.dek-thumb[aria-current="page"]')?.getAttribute("data-slide-index"),
    ).toBe("2");
    expect(document.getElementById("dek-next-end")?.hidden).toBe(false);
  });

  test.serial("hashchange navigates to the slug in the hash", async () => {
    location.hash = "#steps/2";
    window.dispatchEvent(new Event("hashchange"));
    await settle();
    expect(currentSlug()).toBe("steps");
    expect(document.querySelector('#deck [data-step="2"]')?.classList.contains("is-shown")).toBe(
      true,
    );
  });

  test.serial("dekLive reload-slide swaps the fragment and re-applies is-shown", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        '<section class="slide" data-slug="steps"><ul><li data-step="1">A</li><li data-step="2">B</li></ul></section>',
      )) as unknown as typeof fetch;
    try {
      await dekLive({ type: "reload-slide", slug: "steps" });
    } finally {
      globalThis.fetch = original;
    }
    expect(document.querySelector('#deck .slide[data-slug="steps"] li')?.textContent).toBe("A");
    expect(document.querySelector('#deck [data-step="2"]')?.classList.contains("is-shown")).toBe(
      true,
    );
    expect(currentSlug()).toBe("steps");
  });

  test.serial("dekLive diagnostics shows the banner and clears it when empty", async () => {
    await dekLive({
      type: "diagnostics",
      diagnostics: [{ id: "DEK001", severity: "error", message: "missing" }],
    });
    expect(document.querySelector(".dek-diagnostics")?.textContent).toContain("DEK001");
    await dekLive({ type: "diagnostics", diagnostics: [] });
    expect(document.querySelector(".dek-diagnostics")).toBeNull();
  });

  test.serial("a position from a peer moves the deck without being echoed back", async () => {
    // Bun shares BroadcastChannel across the process, so this peer hears what the player posts.
    const peer = new BroadcastChannel(playerChannelName());
    const heard: unknown[] = [];
    peer.addEventListener("message", (event: MessageEvent) => {
      heard.push(event.data);
    });
    try {
      peer.postMessage({ slideIndex: 2, beatIndex: 0 });
      await waitFor(() => currentSlug() === "last");
      // A local move follows; go serialises posts, so any echo of the remote move lands first.
      pressKey("ArrowLeft");
      await waitFor(() => heard.length > 0);
      expect(heard).toEqual([{ slideIndex: 1, beatIndex: 1 }]);
      expect(location.hash).toBe("#steps/2");
    } finally {
      peer.close();
    }
  });

  test.serial("a window of another deck on the same origin does not move this one", async () => {
    const before = location.hash;
    const other = new BroadcastChannel(`${playerChannelName()}-other`);
    const legacy = new BroadcastChannel("dek");
    try {
      other.postMessage({ slideIndex: 0, beatIndex: 0 });
      legacy.postMessage({ slideIndex: 0, beatIndex: 0 });
      await settle();
      await settle();
      expect(location.hash).toBe(before);
    } finally {
      other.close();
      legacy.close();
    }
  });
});
