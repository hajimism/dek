import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { currentSlug, mountPlayer, pressKey, settle, unmountPlayer } from "../helpers/dom.ts";
import { slideDocument } from "../helpers/html.ts";
import { writeProject } from "../helpers/project.ts";
import { waitFor } from "../helpers/wait.ts";

const script = `---
title: Demo
---

## Welcome {#intro}

Hello, everyone.

## Steps {#steps}

Here is the plan.

### one

a

### two

The secret ingredient is patience.

## Last {#last}

end
`;

let root = "";

beforeAll(async () => {
  root = realpathSync(await mkdtemp(join(tmpdir(), "dek-search-")));
  await writeProject(root, {
    decks: [
      {
        name: "demo",
        script,
        slides: {
          intro: slideDocument(
            `<section class="slide"><h2>Welcome</h2><p>Bun runs the build.</p><input id="field"></section>`,
          ),
          steps: slideDocument(`<section class="slide">
  <h2>Steps</h2>
  <ul>
    <li data-step="one">Write the script</li>
    <li data-step="two">Run the <b>build</b> again</li>
  </ul>
  <script>const build = "not on the slide";</script>
</section>`),
          last: slideDocument(`<section class="slide"><h2>Last</h2></section>`),
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

function mount(options: { hash?: string; mode?: "video" } = {}): Promise<void> {
  return mountPlayer(join(root, "decks", "demo"), {
    url: `file:///deck.html${options.hash ?? ""}`,
    ...(options.mode ? { mode: options.mode } : {}),
  });
}

const view = () => document.getElementById("dek-search");
const shadow = (): ShadowRoot => {
  const root = view()?.shadowRoot;
  if (!root) {
    throw new Error("no search view");
  }
  return root;
};
const field = (): HTMLInputElement => shadow().querySelector("input") as HTMLInputElement;
const rows = (): HTMLElement[] => [...shadow().querySelectorAll<HTMLElement>("li")];
const rowText = (): string[] => rows().map((row) => row.textContent ?? "");
const status = (): string => shadow().querySelector("[data-part=status]")?.textContent ?? "";

function type(text: string): void {
  field().value = text;
  field().dispatchEvent(new Event("input", { bubbles: true }));
}

/** A key pressed in the search's field, which crosses out of its shadow root as a real one does. */
const pressInField = (key: string, init: KeyboardEventInit = {}): boolean =>
  pressKey(key, { composed: true, ...init }, field());

describe("the search", () => {
  test.serial(
    "opens on /, its field in hand, and lists each slide that says the words",
    async () => {
      await mount();
      expect(view()?.hidden).toBe(true);
      expect(pressKey("/")).toBe(true);
      expect(view()?.hidden).toBe(false);
      expect(shadow().activeElement).toBe(field());

      type("BUILD");
      // The words of a step still to come count; a slide's script element is none of its words.
      expect(rowText()).toEqual([
        "1WelcomeWelcome Bun runs the build.",
        "2Steps…rite the script Run the build again",
      ]);
      expect(status()).toBe("2 slides");
      expect(rows()[0]?.getAttribute("aria-selected")).toBe("true");
      expect(rows()[0]?.querySelector("mark")?.textContent).toBe("build");
    },
  );

  test.serial("goes to the beat that shows the words, and closes", async () => {
    await mount();
    pressKey("/");
    type("run the build");
    expect(rows()).toHaveLength(1);
    expect(pressInField("Enter")).toBe(true);
    await waitFor(() => currentSlug() === "steps");
    expect(location.hash).toBe("#steps/2");
    expect(view()?.hidden).toBe(true);
  });

  test.serial(
    "moves through the slides it found with the arrow keys, and goes to one clicked",
    async () => {
      await mount();
      pressKey("/");
      type("build");
      pressInField("ArrowDown");
      expect(rows()[1]?.getAttribute("aria-selected")).toBe("true");
      pressInField("ArrowDown");
      expect(rows()[0]?.getAttribute("aria-selected")).toBe("true");
      pressInField("ArrowUp");
      expect(rows()[1]?.getAttribute("aria-selected")).toBe("true");

      rows()[0]?.click();
      await settle();
      expect(currentSlug()).toBe("intro");
      expect(view()?.hidden).toBe(true);
    },
  );

  test.serial(
    "finds words said only in the script, and the title, and says when none do",
    async () => {
      await mount();
      pressKey("/");
      type("patience");
      expect(rowText()).toEqual(["2StepsScript…he secret ingredient is patience."]);
      type("last");
      // A title the slide repeats is counted once.
      expect(rowText()).toEqual(["3LastLast"]);
      type("nowhere");
      expect(rows()).toEqual([]);
      expect(status()).toBe("No slide says that");
    },
  );

  test.serial("keeps the keys typed into it from the deck, and closes on Escape", async () => {
    await mount();
    pressKey("/");
    const railHidden = document.body.classList.contains("is-rail-hidden");
    for (const key of [" ", "ArrowRight", "s", "f", "End"]) {
      pressInField(key);
    }
    await settle();
    expect(currentSlug()).toBe("intro");
    expect(document.body.classList.contains("is-rail-hidden")).toBe(railHidden);

    expect(pressInField("Escape")).toBe(true);
    expect(view()?.hidden).toBe(true);
    expect(currentSlug()).toBe("intro");
    // Closed, the keys are the deck's again.
    pressKey("ArrowRight");
    await waitFor(() => currentSlug() === "steps");
  });

  test.serial("leaves a / typed into a field on a slide to the field", async () => {
    await mount();
    expect(pressKey("/", {}, document.getElementById("field") as Element)).toBe(false);
    expect(view()?.hidden).toBe(true);
  });

  test.serial("reads the slides again each time it opens, and keeps what was typed", async () => {
    await mount();
    pressKey("/");
    type("build");
    pressInField("Escape");
    const list = document.querySelector('#deck > .slide[data-slug="last"]');
    list?.append(Object.assign(document.createElement("p"), { textContent: "build it" }));
    pressKey("/");
    expect(field().value).toBe("build");
    expect(rows()).toHaveLength(3);
  });

  test.serial("is not in a video", async () => {
    await mount({ mode: "video" });
    expect(pressKey("/")).toBe(false);
    expect(view()).toBeNull();
  });
});
