import { afterAll, beforeAll, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { currentSlug, mountPlayer, pressKey, settle, unmountPlayer } from "../helpers/dom.ts";
import { slideDocument } from "../helpers/html.ts";
import { writeProject } from "../helpers/project.ts";

const dialed: string[] = [];
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
  // A built file on a static host such as GitHub Pages: https, and no dev server behind it.
  await mountPlayer(join(root, "decks", "demo"), {
    url: "https://example.github.io/talks/demo.html#intro",
    beforeStart: () => {
      (globalThis as { WebSocket: unknown }).WebSocket = class {
        constructor(url: string) {
          dialed.push(url);
        }
      };
    },
  });
});

afterAll(async () => {
  await unmountPlayer();
  await rm(root, { recursive: true, force: true });
});

test.serial("a built file served over https plays without dialing a socket", async () => {
  pressKey("ArrowRight");
  await settle();
  expect(currentSlug()).toBe("next");
  expect(dialed).toEqual([]);
});
