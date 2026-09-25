import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
title: Demo
---

## intro

hello

## steps

body

### one

a

### two

b

### three

c

## last

end
`;

const stepsHtml = slideDocument(`<section class="slide">
  <ul>
    <li data-step="one">A</li>
    <li data-step="two">B</li>
    <li data-step="three">C</li>
  </ul>
  <input id="field">
</section>`);

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
          steps: stepsHtml,
          last: slideDocument(`<section class="slide"><h2>last</h2></section>`),
        },
      },
    ],
  });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

afterEach(async () => {
  await unmountPlayer();
});

function mount(hash = "", beforeStart?: () => void): Promise<void> {
  return mountPlayer(join(root, "decks", "demo"), {
    url: `file:///deck.html${hash}`,
    ...(beforeStart ? { beforeStart } : {}),
  });
}

const shownSteps = (): string[] =>
  [...document.querySelectorAll("#deck .slide.is-current [data-step].is-shown")].map(
    (el) => el.getAttribute("data-step") ?? "",
  );

/** An animation that runs until something calls `finish()`, as a slow beat transition does. */
function runningAnimation(): { finish: () => void; finished: Promise<void>; calls: () => number } {
  let resolve: () => void = () => undefined;
  let calls = 0;
  const animation = {
    playState: "running",
    effect: { getComputedTiming: () => ({ endTime: 750 }) },
    finished: new Promise<void>((done) => {
      resolve = done;
    }),
    finish() {
      calls += 1;
      animation.playState = "finished";
      resolve();
    },
  };
  return Object.assign(animation, { calls: () => calls });
}

/** A press and release on the slide stage, as a mouse, pen, or finger makes it. */
function click(x: number, init: PointerEventInit & { pointerType?: string } = {}): void {
  const stage = document.getElementById("dek-current-stage");
  if (!stage) {
    throw new Error("no stage");
  }
  stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 500 }) as DOMRect;
  const options = { clientX: x, clientY: 200, bubbles: true, pointerType: "mouse", ...init };
  stage.dispatchEvent(new PointerEvent("pointerdown", options));
  stage.dispatchEvent(new PointerEvent("pointerup", options));
}

describe("clicking the slide", () => {
  test.serial("a click on the right goes forward and on the left third goes back", async () => {
    await mount("#steps");
    click(700);
    await waitFor(() => shownSteps().includes("two"));
    click(100);
    await waitFor(() => !shownSteps().includes("two"));
    expect(shownSteps()).toEqual(["one"]);
  });

  for (const [name, init] of [
    ["a right click", { button: 2 }],
    ["a click with Cmd held", { metaKey: true }],
    ["a Shift click, which extends a selection", { shiftKey: true }],
  ] as const) {
    test.serial(`${name} stays on the beat`, async () => {
      await mount("#steps");
      click(700, init);
      await settle();
      expect(shownSteps()).toEqual(["one"]);
    });
  }

  test.serial("a click that ends a text selection stays on the beat", async () => {
    await mount("#steps");
    const item = document.querySelector("#deck .slide.is-current [data-step]");
    if (item) {
      getSelection()?.selectAllChildren(item);
    }
    click(700);
    await settle();
    expect(shownSteps()).toEqual(["one"]);
  });

  test.serial("a touch still swipes, where a mouse drag would select", async () => {
    await mount("#steps");
    const stage = document.getElementById("dek-current-stage");
    if (!stage) {
      throw new Error("no stage");
    }
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 500 }) as DOMRect;
    const at = (clientX: number) => ({
      clientX,
      clientY: 200,
      bubbles: true,
      pointerType: "mouse",
    });
    stage.dispatchEvent(new PointerEvent("pointerdown", at(500)));
    stage.dispatchEvent(new PointerEvent("pointerup", at(380)));
    await settle();
    expect(shownSteps()).toEqual(["one"]);
    stage.dispatchEvent(new PointerEvent("pointerdown", { ...at(500), pointerType: "touch" }));
    stage.dispatchEvent(new PointerEvent("pointerup", { ...at(380), pointerType: "touch" }));
    await waitFor(() => shownSteps().includes("two"));
  });
});

describe("navigation", () => {
  test.serial("counts every press made while a move is still animating", async () => {
    await mount("#intro");
    const animation = runningAnimation();
    (document as { getAnimations: () => unknown[] }).getAnimations = () => [animation];
    for (let i = 0; i < 4; i++) {
      pressKey("ArrowRight");
    }
    await waitFor(() => currentSlug() === "last");
    expect(location.hash).toBe("#last");
    // The move in flight was cut short rather than played out while the presenter waited.
    expect(animation.calls()).toBeGreaterThan(0);
  });

  test.serial("tells other windows where it is going before the move settles", async () => {
    await mount("#intro");
    const animation = runningAnimation();
    (document as { getAnimations: () => unknown[] }).getAnimations = () => [animation];
    const peer = new BroadcastChannel(playerChannelName());
    const heard: unknown[] = [];
    peer.addEventListener("message", (event: MessageEvent) => heard.push(event.data));
    try {
      pressKey("ArrowRight");
      await waitFor(() => heard.length > 0);
      expect(heard).toEqual([{ slideIndex: 1, beatIndex: 0 }]);
      expect(animation.calls()).toBe(0);
    } finally {
      animation.finish();
      peer.close();
    }
  });

  test.serial("ignores keys held with Alt, Ctrl, or Cmd, which belong to the browser", async () => {
    await mount("#steps");
    for (const init of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }]) {
      expect(pressKey("ArrowRight", init)).toBe(false);
    }
    await settle();
    expect(shownSteps()).toEqual(["one"]);
  });

  test.serial("leaves keys typed into a field on the slide to the field", async () => {
    await mount("#steps");
    const field = document.getElementById("field");
    if (!field) {
      throw new Error("no field");
    }
    for (const key of [" ", "ArrowRight", "Backspace", "s", "p"]) {
      expect(pressKey(key, {}, field)).toBe(false);
    }
    await settle();
    expect(shownSteps()).toEqual(["one"]);
    expect(document.body.classList.contains("is-rail-hidden")).toBe(false);
    expect(document.body.classList.contains("is-presenter")).toBe(false);
  });

  test.serial("Shift+Space goes back, as Space goes forward", async () => {
    await mount("#steps/2");
    expect(pressKey(" ", { shiftKey: true })).toBe(true);
    await settle();
    expect(shownSteps()).toEqual(["one"]);
  });

  test.serial("Home and End jump to the first beat and the last", async () => {
    await mount("#steps/2");
    pressKey("End");
    await waitFor(() => currentSlug() === "last");
    pressKey("Home");
    await waitFor(() => currentSlug() === "intro");
    expect(location.hash).toBe("#intro");
  });

  test.serial("a beat past the last in the URL opens at the last beat and says so", async () => {
    await mount("#steps/99");
    expect(currentSlug()).toBe("steps");
    expect(shownSteps()).toEqual(["one", "two", "three"]);
    expect(location.hash).toBe("#steps/3");
    pressKey("ArrowLeft");
    await settle();
    expect(location.hash).toBe("#steps/2");
  });

  test.serial("Back leaves the slide instead of stepping back through its beats", async () => {
    await mount("#intro");
    const start = history.length;
    pressKey("ArrowRight");
    await settle();
    pressKey("ArrowRight");
    await settle();
    pressKey("ArrowRight");
    await settle();
    expect(location.hash).toBe("#steps/3");
    // One entry for the slide, however many beats it took to get through it.
    expect(history.length).toBe(start + 1);
  });

  test.serial("f toggles fullscreen", async () => {
    await mount("#intro");
    let requested = 0;
    document.documentElement.requestFullscreen = async () => {
      requested += 1;
    };
    expect(pressKey("f")).toBe(true);
    expect(requested).toBe(1);
  });

  test.serial("announces each new slide to screen readers, not each beat", async () => {
    await mount("#intro");
    const announce = document.getElementById("dek-announce");
    expect(announce?.getAttribute("aria-live")).toBe("polite");
    pressKey("ArrowRight");
    await settle();
    expect(announce?.textContent).toBe("Slide 2 of 3: steps");
    if (announce) {
      announce.textContent = "";
    }
    pressKey("ArrowRight");
    await settle();
    expect(announce?.textContent).toBe("");
  });

  test.serial("the rail's resize handle reports its width and moves with arrow keys", async () => {
    await mount("#intro");
    const handle = document.getElementById("dek-rail-resize");
    expect(handle?.getAttribute("aria-valuemin")).toBe("120");
    expect(handle?.getAttribute("aria-valuemax")).toBe("360");
    expect(handle?.getAttribute("aria-valuenow")).toBe("188");
    if (handle) {
      pressKey("ArrowRight", {}, handle);
    }
    expect(handle?.getAttribute("aria-valuenow")).toBe("204");
    await settle();
    // The key resized the rail; it did not also move the deck.
    expect(currentSlug()).toBe("intro");
  });

  test.serial("skips the slide transition when the viewer asks for reduced motion", async () => {
    await mount("#intro", () => {
      window.matchMedia = ((query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener() {},
        removeEventListener() {},
      })) as unknown as typeof window.matchMedia;
    });
    let transitions = 0;
    (document as { startViewTransition?: unknown }).startViewTransition = (fn: () => void) => {
      transitions += 1;
      fn();
      return { finished: Promise.resolve(), skipTransition() {} };
    };
    pressKey("ArrowRight");
    await settle();
    expect(currentSlug()).toBe("steps");
    expect(transitions).toBe(0);
  });

  test.serial("still shows the deck when the browser blocks storage", async () => {
    await mount("#steps", () => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() {
          throw new DOMException("blocked", "SecurityError");
        },
      });
    });
    expect(currentSlug()).toBe("steps");
    pressKey("s");
    await settle();
    expect(document.body.classList.contains("is-rail-hidden")).toBe(true);
  });
});
