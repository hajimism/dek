import { realpathSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mountPlayer, unmountPlayer } from "./dom.ts";
import { slideDocument } from "./html.ts";
import { writeProject } from "./project.ts";

export const script = `---
title: Demo
---

## intro

hello

## chart

### base {#base}

first

### growth {#growth}

second
`;

// Writes what it was asked to draw, so the test can read the frame back from the DOM.
export const chartScript = `export default {
  motion: { growth: 40 },
  draw(slide, { index, step, t }) {
    slide.querySelector(".bar").textContent = index + ":" + step + ":" + t;
  },
};
`;

let root = "";

/** Mounts a two-slide deck whose `chart` slide has a script that writes each frame into `.bar`. */
export async function mountChartDeck(mode: "player" | "video", url?: string): Promise<void> {
  root = realpathSync(await mkdtemp(join(tmpdir(), "dek-")));
  await writeProject(root, {
    decks: [
      {
        name: "demo",
        script,
        slides: {
          intro: slideDocument(`<section class="slide"><h2>intro</h2></section>`),
          chart: slideDocument(`<section class="slide"><p class="bar"></p></section>`),
        },
      },
    ],
  });
  await writeFile(join(root, "decks", "demo", "slides", "chart.ts"), chartScript);
  await mountPlayer(join(root, "decks", "demo"), { mode, ...(url ? { url } : {}) });
}

export async function unmountChartDeck(): Promise<void> {
  await unmountPlayer();
  await rm(root, { recursive: true, force: true });
}

export const bar = (): string | null | undefined =>
  document.querySelector('#deck > .slide[data-slug="chart"] .bar')?.textContent;
