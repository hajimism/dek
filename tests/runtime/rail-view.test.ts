import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RAIL_WIDTH_STEP } from "../../src/runtime/rail.ts";
import { resizeStep, thumbStep } from "../../src/runtime/rail-view.ts";
import { currentSlug, mountPlayer, pressKey, unmountPlayer } from "../helpers/dom.ts";
import { slideDocument } from "../helpers/html.ts";
import { writeProject } from "../helpers/project.ts";
import { waitFor } from "../helpers/wait.ts";

const script = `---
title: Demo
---

## intro

hello

## middle

body

## last

end
`;

let root = "";

beforeAll(async () => {
  root = realpathSync(await mkdtemp(join(tmpdir(), "dekc-")));
  await writeProject(root, {
    decks: [
      {
        name: "demo",
        script,
        slides: Object.fromEntries(
          ["intro", "middle", "last"].map((slug) => [
            slug,
            slideDocument(`<section class="slide"><h2>${slug}</h2></section>`),
          ]),
        ),
      },
    ],
  });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

function mount(hash = "", beforeStart?: () => void): Promise<void> {
  return mountPlayer(join(root, "decks", "demo"), {
    url: `file:///deck.html${hash}`,
    ...(beforeStart ? { beforeStart } : {}),
  });
}

const thumb = (index: number): HTMLElement => {
  const el = document.querySelector<HTMLElement>(`.dekc-thumb[data-slide-index="${index}"]`);
  if (!el) {
    throw new Error(`no thumb ${index}`);
  }
  return el;
};

const handle = (): HTMLElement => {
  const el = document.getElementById("dekc-rail-resize");
  if (!el) {
    throw new Error("no handle");
  }
  return el;
};

const railWidth = (): string => document.documentElement.style.getPropertyValue("--dekc-rail-w");

describe("the rail", () => {
  afterEach(async () => {
    await unmountPlayer();
  });

  test.serial("draws each thumbnail at the deck's size and marks the current one", async () => {
    await mount("#middle");
    const stages = [...document.querySelectorAll<HTMLElement>("#dekc-rail .dekc-thumb-stage")];
    expect(stages.map((el) => [el.style.width, el.style.height])).toEqual(
      Array(3).fill(["1280px", "720px"]),
    );
    expect(stages.map((el) => el.querySelector("h2")?.textContent)).toEqual([
      "intro",
      "middle",
      "last",
    ]);
    expect(thumb(1).getAttribute("aria-current")).toBe("page");
    expect(thumb(1).classList.contains("is-current")).toBe(true);
    expect(thumb(0).hasAttribute("aria-current")).toBe(false);
  });

  test.serial(
    "arrow keys on a thumbnail pick the slide next to it and focus its thumb",
    async () => {
      await mount("#intro");
      expect(pressKey("ArrowDown", {}, thumb(0))).toBe(true);
      await waitFor(() => currentSlug() === "middle");
      expect(document.activeElement).toBe(thumb(1));
      expect(pressKey("ArrowUp", {}, thumb(1))).toBe(true);
      await waitFor(() => currentSlug() === "intro");
      expect(document.activeElement).toBe(thumb(0));
      // Past either end the key is still the rail's, and nothing moves.
      expect(pressKey("ArrowUp", {}, thumb(0))).toBe(true);
      expect(currentSlug()).toBe("intro");
    },
  );

  test.serial(
    "dragging the handle resizes the rail and remembers the width on release",
    async () => {
      await mount("#intro");
      localStorage.removeItem("dekc.railWidth");
      const el = handle();
      el.dispatchEvent(new PointerEvent("pointerdown", { clientX: 250, pointerId: 1 }));
      expect(el.hasAttribute("data-dragging")).toBe(true);
      expect(railWidth()).toBe("250px");
      el.dispatchEvent(new PointerEvent("pointermove", { clientX: 1000, pointerId: 1 }));
      expect(railWidth()).toBe("360px");
      expect(el.getAttribute("aria-valuenow")).toBe("360");
      expect(localStorage.getItem("dekc.railWidth")).toBeNull();
      el.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
      expect(el.hasAttribute("data-dragging")).toBe(false);
      expect(localStorage.getItem("dekc.railWidth")).toBe("360");
      // Released: a stray move no longer resizes.
      el.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, pointerId: 1 }));
      expect(railWidth()).toBe("360px");
    },
  );

  test.serial("opens at the remembered width, and the arrow keys remember theirs", async () => {
    await mount("#intro", () => localStorage.setItem("dekc.railWidth", "300"));
    expect(railWidth()).toBe("300px");
    pressKey("ArrowLeft", {}, handle());
    expect(localStorage.getItem("dekc.railWidth")).toBe("284");
  });
});

describe("thumbStep", () => {
  test("goes down the rail with ArrowDown and up with ArrowUp", () => {
    expect(thumbStep("ArrowDown")).toBe(1);
    expect(thumbStep("ArrowUp")).toBe(-1);
    expect(thumbStep("ArrowLeft")).toBeUndefined();
    expect(thumbStep("Enter")).toBeUndefined();
  });
});

describe("resizeStep", () => {
  test("widens with ArrowRight and narrows with ArrowLeft", () => {
    expect(resizeStep("ArrowRight")).toBe(RAIL_WIDTH_STEP);
    expect(resizeStep("ArrowLeft")).toBe(-RAIL_WIDTH_STEP);
    expect(resizeStep("ArrowUp")).toBeUndefined();
  });
});
