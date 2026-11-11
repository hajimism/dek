import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { phraseBoundaries } from "../../src/core/budoux/parser.ts";
import { mountPlayer, unmountPlayer } from "../helpers/dom.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const title = "台本を先に書いてから画面を組み立てる";

const deck = {
  name: "demo",
  script: `---
title: デモ
lang: ja
---

## intro

台本を先に書く。

## next

次へ。
`,
  slides: {
    intro: slideDocument(`<section class="slide"><h2 class="slide-title">${title}</h2></section>`),
    next: slideDocument(`<section class="slide"><h2 class="slide-title">次へ</h2></section>`),
  },
};

/** Mount the built player of a Japanese deck in a browser that breaks by phrase, or does not. */
async function mount(autoPhrase: boolean): Promise<void> {
  await withTempProject({ decks: [deck] }, async (root) => {
    await mountPlayer(join(root, "decks", "demo"), {
      // happy-dom's CSS says yes to everything, and gives a new one each time it is read.
      beforeStart: () => {
        Object.defineProperty(globalThis, "CSS", {
          value: { supports: () => autoPhrase },
          configurable: true,
        });
      },
    });
  });
}

describe("the player in a Japanese deck", () => {
  afterEach(async () => {
    await unmountPlayer();
  });

  test.serial(
    "breaks each slide by phrase before the rail copies it, without auto-phrase",
    async () => {
      await mount(false);
      const slide = document.querySelector('#deck [data-slug="intro"]');
      expect(slide?.querySelectorAll("wbr").length).toBe(phraseBoundaries(title).length);
      expect(slide?.textContent).toBe(title);
      const thumbs = [...document.querySelectorAll(".dek-thumb .slide")];
      expect(thumbs.length).toBeGreaterThan(0);
      expect(thumbs[0]?.querySelectorAll("wbr").length).toBe(phraseBoundaries(title).length);
    },
  );

  test.serial(
    "leaves the slides as written where the browser breaks by phrase itself",
    async () => {
      await mount(true);
      expect(document.querySelector("#deck wbr")).toBeNull();
    },
  );
});
