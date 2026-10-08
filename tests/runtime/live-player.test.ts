import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { currentSlug, dekLive, mountPlayer, unmountPlayer } from "../helpers/dom.ts";
import { slideDocument } from "../helpers/html.ts";
import { writeProject } from "../helpers/project.ts";

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
`;

let root = "";
/** What the dev server answers next; the speaker's page asks for its marks and annotations too. */
let served: Response | undefined;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  root = realpathSync(await mkdtemp(join(tmpdir(), "dek-")));
  await writeProject(root, {
    decks: [
      {
        name: "demo",
        script,
        slides: {
          intro: slideDocument(`<section class="slide"><h2>intro</h2></section>`),
          steps: slideDocument(`<section class="slide">
  <ul>
    <li data-step="1">A</li>
    <li data-step="2">B</li>
  </ul>
</section>`),
        },
      },
    ],
  });
  await mountPlayer(join(root, "decks", "demo"), {
    live: true,
    url: "http://localhost:3000/#steps/2",
    beforeStart: () => {
      (globalThis as { WebSocket: unknown }).WebSocket = class {
        readyState = 0;
        addEventListener(): void {}
        send(): void {}
        close(): void {}
      };
      globalThis.fetch = (async () => {
        const response = served ?? Response.json({ ok: true, positions: [], annotations: [] });
        served = undefined;
        return response;
      }) as unknown as typeof fetch;
    },
  });
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await unmountPlayer();
  await rm(root, { recursive: true, force: true });
});

describe("the dev server's live updates", () => {
  test.serial("a reloaded slide swaps its fragment and keeps its beat", async () => {
    served = new Response(
      '<section class="slide" data-slug="steps"><ul><li data-step="1">A</li><li data-step="2">B</li></ul></section>',
    );
    await dekLive({ type: "reload-slide", slug: "steps" });
    expect(document.querySelector('#deck .slide[data-slug="steps"] li')?.textContent).toBe("A");
    expect(document.querySelector('#deck [data-step="2"]')?.classList.contains("is-shown")).toBe(
      true,
    );
    expect(currentSlug()).toBe("steps");
  });

  test.serial("diagnostics show a banner, cleared once there are none", async () => {
    await dekLive({
      type: "diagnostics",
      diagnostics: [{ id: "DEK001", severity: "error", message: "missing" }],
    });
    expect(document.querySelector(".dek-diagnostics")?.textContent).toContain("DEK001");
    await dekLive({ type: "diagnostics", diagnostics: [] });
    expect(document.querySelector(".dek-diagnostics")).toBeNull();
  });
});
