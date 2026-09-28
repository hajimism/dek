import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PresenterSlide } from "../../src/core/presenter-state.ts";
import {
  opensAsPresenter,
  presenterPanels,
  progressSegments,
} from "../../src/runtime/presenter-view.ts";
import { dekGo, mountPlayer, pressKey, settle, unmountPlayer } from "../helpers/dom.ts";
import { slideDocument } from "../helpers/html.ts";
import { writeProject } from "../helpers/project.ts";

const script = `---
title: Demo
duration: 20m
---

## intro

hello

## steps

body

### one

a

### two

b

## last

end
`;

let root = "";

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
  <p data-step="one">A</p>
  <p data-step="two">B</p>
</section>`),
          last: slideDocument(`<section class="slide"><h2>last</h2></section>`),
        },
      },
    ],
  });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

function mount(url: string): Promise<void> {
  return mountPlayer(join(root, "decks", "demo"), { url: `file:///deck.html${url}` });
}

const text = (id: string): string | null | undefined => document.getElementById(id)?.textContent;

const progress = (): Array<{ className: string; fill: string }> =>
  [...document.querySelectorAll<HTMLElement>("#dek-progress > span")].map((span) => ({
    className: span.className,
    fill: span.style.getPropertyValue("--dek-fill"),
  }));

describe("the presenter's panels", () => {
  afterEach(async () => {
    await unmountPlayer();
  });

  test.serial("show the slide's script, page, what comes next, and the progress", async () => {
    await mount("?presenter#steps/1");
    expect(text("dek-script")).toContain("body");
    expect(text("dek-page")?.replace(/\s+/g, " ")).toBe("2 / 3");
    expect(document.querySelector("#dek-page .dek-page-total")?.textContent).toBe("/ 3");
    expect(text("dek-next")).toBe("steps");
    expect(document.getElementById("dek-next-end")?.hidden).toBe(true);
    expect(progress()).toEqual([
      { className: "is-done", fill: "" },
      { className: "is-current", fill: `${(2 / 3) * 100}%` },
      { className: "", fill: "" },
    ]);
    expect(document.getElementById("dek-progress")?.hidden).toBe(false);
  });

  test.serial("name the next slide at a slide's last beat, and the end at the deck's", async () => {
    await mount("?presenter#steps/2");
    expect(text("dek-next")).toBe("last");
    await dekGo({ slideIndex: 2, beatIndex: 0 });
    expect(text("dek-next")).toBe("");
    expect(document.getElementById("dek-next-end")?.hidden).toBe(false);
    expect(document.querySelector("#dek-next-stage")?.children.length).toBe(0);
  });

  test.serial("preview the next beat at the deck's size, with its steps shown", async () => {
    await mount("?presenter#steps/0");
    const frame = document.querySelector<HTMLElement>("#dek-next-stage .dek-preview-frame");
    expect(frame?.style.width).toBe("1280px");
    expect(frame?.style.height).toBe("720px");
    expect(
      [...(frame?.querySelectorAll("[data-step].is-shown") ?? [])].map((el) =>
        el.getAttribute("data-step"),
      ),
    ).toEqual(["one"]);
  });

  test.serial("draw no preview while the panels are hidden", async () => {
    await mount("#steps/0");
    expect(document.getElementById("dek-presenter")?.hidden).toBe(true);
    expect(document.getElementById("dek-progress")?.hidden).toBe(true);
    expect(document.querySelector("#dek-next-stage")?.children.length).toBe(0);
  });

  test.serial("show the slide's budget and start the clock at the first move", async () => {
    await mount("?presenter#intro");
    const budget = text("dek-budget");
    expect(budget).toMatch(/^\d+:\d\d$/);
    expect(text("dek-elapsed")).toBe("0:00");
    const elapsed = document.getElementById("dek-elapsed");
    if (elapsed) {
      elapsed.textContent = "";
    }
    pressKey("ArrowRight");
    await settle();
    expect(text("dek-elapsed")).toBe("0:00");
    expect(elapsed?.classList.contains("is-warn")).toBe(false);
    expect(elapsed?.classList.contains("is-over")).toBe(false);
  });
});

const slides: PresenterSlide[] = [
  { slug: "intro", title: "Intro", script: "hello", beats: [], budgetSeconds: 90 },
  {
    slug: "steps",
    title: "Steps",
    script: "body",
    beats: [{ title: "one" }, { title: "two" }],
  },
];
const deck = [
  { slug: "intro", stops: 1 },
  { slug: "steps", stops: 3 },
];

describe("presenterPanels", () => {
  test("says the slide's script, budget, beats, and what comes after this beat", () => {
    expect(presenterPanels(slides, deck, { slideIndex: 0, beatIndex: 0 })).toEqual({
      script: "hello",
      next: "Steps",
      nextPos: { slideIndex: 1, beatIndex: 0 },
      beats: [],
      budget: "1:30",
    });
    expect(presenterPanels(slides, deck, { slideIndex: 1, beatIndex: 1 })).toEqual({
      script: "body",
      next: "Steps",
      nextPos: { slideIndex: 1, beatIndex: 2 },
      beats: slides[1]?.beats,
      budget: "",
    });
  });

  test("has nothing next at the deck's last beat", () => {
    const panels = presenterPanels(slides, deck, { slideIndex: 1, beatIndex: 2 });
    expect(panels.next).toBe("");
    expect(panels.nextPos).toBeNull();
  });

  test("leaves the script and beats alone for a slide that is not there", () => {
    expect(presenterPanels(slides, deck, { slideIndex: 5, beatIndex: 0 })).toEqual({
      script: undefined,
      next: "",
      nextPos: null,
      beats: undefined,
      budget: "",
    });
  });
});

describe("progressSegments", () => {
  test("marks the slides before as done and fills the current one by its beats", () => {
    expect(
      progressSegments([...deck, { slug: "last", stops: 1 }], { slideIndex: 1, beatIndex: 0 }),
    ).toEqual([
      { className: "is-done" },
      { className: "is-current", fill: `${(1 / 3) * 100}%` },
      {},
    ]);
  });
});

describe("opensAsPresenter", () => {
  test("opens on the presenter page or with ?presenter", () => {
    expect(opensAsPresenter("", "presenter")).toBe(true);
    expect(opensAsPresenter("?presenter", "player")).toBe(true);
    expect(opensAsPresenter("?a=1&presenter=", "player")).toBe(true);
    expect(opensAsPresenter("?rehearse", "player")).toBe(false);
  });
});
