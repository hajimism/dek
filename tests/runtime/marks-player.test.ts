import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dekGo, mountPlayer, pressKey, unmountPlayer } from "../helpers/dom.ts";
import { slideDocument } from "../helpers/html.ts";
import { writeProject } from "../helpers/project.ts";
import { waitFor } from "../helpers/wait.ts";

const script = `---
title: Marks
---

## intro

hello

### first

one

### second

two
`;

type Sent = { method: string; url: string; body?: unknown };

/** Stands in for the dev server's /marks: it keeps the marks and answers as the server does. */
const sent: Sent[] = [];
let marked: Array<{ slideIndex: number; beatIndex: number }> = [];
let refuse = false;

async function marksServer(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  sent.push({ method: init?.method ?? "GET", url, ...(body ? { body } : {}) });
  if (refuse) {
    return new Response("Unauthorized\n", { status: 401 });
  }
  if (init?.method === "POST") {
    const at = marked.findIndex(
      (pos) => pos.slideIndex === body.slideIndex && pos.beatIndex === body.beatIndex,
    );
    marked = at >= 0 ? marked.filter((_, index) => index !== at) : [...marked, body];
    return Response.json({ ok: true, marked: at < 0, positions: marked });
  }
  return Response.json({ ok: true, positions: marked });
}

let root = "";

beforeAll(async () => {
  root = realpathSync(await mkdtemp(join(tmpdir(), "dek-")));
  await writeProject(root, {
    decks: [
      {
        name: "marks",
        script,
        slides: { intro: slideDocument(`<section class="slide"><h2>intro</h2></section>`) },
      },
    ],
  });
  marked = [{ slideIndex: 0, beatIndex: 2 }];
  await mountPlayer(join(root, "decks", "marks"), {
    live: true,
    url: "http://localhost:3000/#intro",
    beforeStart: () => {
      globalThis.fetch = marksServer as typeof fetch;
      (globalThis as { WebSocket: unknown }).WebSocket = class {
        readyState = 0;
        addEventListener(): void {}
        send(): void {}
        close(): void {}
      };
      (globalThis as { EventSource: unknown }).EventSource = class {
        addEventListener(): void {}
        close(): void {}
      };
    },
  });
});

afterAll(async () => {
  await unmountPlayer();
  await rm(root, { recursive: true, force: true });
});

const button = (): HTMLElement | null => document.getElementById("dek-mark-toggle");
const beatItem = (n: number): Element | null =>
  document.querySelector(`#dek-beats [data-beat-index="${n}"]`);

describe("marks in the presenter view", () => {
  test.serial("shows the marks the deck already has as the page opens", async () => {
    await waitFor(() => beatItem(2)?.classList.contains("is-marked") === true);
    expect(sent[0]).toEqual({ method: "GET", url: "/marks" });
    expect(beatItem(1)?.classList.contains("is-marked")).toBe(false);
    expect(button()?.getAttribute("aria-pressed")).toBe("false");
  });

  test.serial("`m` marks the beat on screen, and says so on its button", async () => {
    await dekGo({ slideIndex: 0, beatIndex: 1 });
    expect(pressKey("m")).toBe(true);
    await waitFor(() => button()?.getAttribute("aria-pressed") === "true");
    expect(sent.at(-1)).toEqual({
      method: "POST",
      url: "/marks",
      body: { slideIndex: 0, beatIndex: 1 },
    });
    expect(beatItem(1)?.classList.contains("is-marked")).toBe(true);
  });

  test.serial("follows the beat on screen, and unmarks it from the button", async () => {
    await dekGo({ slideIndex: 0, beatIndex: 0 });
    expect(button()?.getAttribute("aria-pressed")).toBe("false");
    await dekGo({ slideIndex: 0, beatIndex: 1 });
    expect(button()?.getAttribute("aria-pressed")).toBe("true");
    button()?.click();
    await waitFor(() => button()?.getAttribute("aria-pressed") === "false");
    expect(beatItem(1)?.classList.contains("is-marked")).toBe(false);
  });

  test.serial("says on its button when the server would not take a mark", async () => {
    refuse = true;
    try {
      pressKey("m");
      await waitFor(() => button()?.hasAttribute("data-error") === true);
      expect(button()?.getAttribute("aria-pressed")).toBe("false");
      expect(button()?.title).toContain("401");
    } finally {
      refuse = false;
    }
    pressKey("m");
    await waitFor(() => button()?.getAttribute("aria-pressed") === "true");
    expect(button()?.hasAttribute("data-error")).toBe(false);
  });
});
