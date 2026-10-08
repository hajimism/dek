import { afterAll, beforeAll, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { currentSlug, mountPlayer, pressKey, settle, unmountPlayer } from "../helpers/dom.ts";
import { slideDocument } from "../helpers/html.ts";
import { writeProject } from "../helpers/project.ts";

const dialed: string[] = [];
const fetched: string[] = [];
const realFetch = globalThis.fetch;
let root = "";

beforeAll(async () => {
  root = realpathSync(await mkdtemp(join(tmpdir(), "dek-static-host-")));
  await writeProject(root, {
    decks: [
      {
        name: "demo",
        script: "---\ntitle: Demo\n---\n\n## intro\n\nhello\n\n## next\n\nthere\n",
        slides: {
          intro: slideDocument(`<section class="slide"><h2>intro</h2></section>`),
          next: slideDocument(`<section class="slide"><h2>next</h2></section>`),
        },
      },
    ],
  });
  // A built file on a static host such as GitHub Pages: https, and no dev server behind it. The
  // URL asks for a rehearsal, which only the dev server has.
  await mountPlayer(join(root, "decks", "demo"), {
    url: "https://example.github.io/talks/demo.html?rehearse#intro",
    beforeStart: () => {
      (globalThis as { WebSocket: unknown }).WebSocket = class {
        constructor(url: string) {
          dialed.push(url);
        }
      };
      globalThis.fetch = (async (input: string) => {
        fetched.push(String(input));
        return new Response(null, { status: 404 });
      }) as typeof fetch;
    },
  });
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await unmountPlayer();
  await rm(root, { recursive: true, force: true });
});

test.serial("a built file served over https plays without dialing a socket", async () => {
  pressKey("ArrowRight");
  await settle();
  expect(currentSlug()).toBe("next");
  expect(dialed).toEqual([]);
});

test.serial("a built file asks no server for a rehearsal and takes no live updates", async () => {
  await settle();
  expect(fetched).toEqual([]);
  expect((window as { dekLive?: unknown }).dekLive).toBeUndefined();
});
