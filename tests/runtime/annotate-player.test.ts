import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readNotes } from "../../src/runtime/annotate-notes.ts";
import {
  currentSlug,
  dekLive,
  mountPlayer,
  pressKey,
  settle,
  unmountPlayer,
} from "../helpers/dom.ts";
import { slideDocument } from "../helpers/html.ts";
import { writeProject } from "../helpers/project.ts";
import { waitFor } from "../helpers/wait.ts";

const script = `---
title: Plan
lang: en
---

## cover

hi

## plan

### base {#base}

one
`;

// slideDocument puts the section on line 8; the lane is on 9, the chevron on 10, the arrow on 11.
const planHtml = slideDocument(`<section class="slide">
  <div class="lane">
    <div class="chevron">画面 <b>設計</b></div>
    <div class="arrow" style="pointer-events: none"></div>
  </div>
</section>`);

/** The plan slide as the dev server sends it after an edit put a line above it. */
const movedDown = `<section class="slide" data-slug="plan" data-dek-source="9:3" data-dek-class="slide">
  <div class="lane" data-dek-source="10:3" data-dek-class="lane">
    <div class="chevron" data-dek-source="11:5" data-dek-class="chevron">画面 <b data-dek-source="11:29">設計</b></div>
    <div class="arrow" style="pointer-events: none" data-dek-source="12:5" data-dek-class="arrow"></div>
  </div>
</section>`;

/** The plan slide after an edit took the arrow away. */
const arrowGone = `<section class="slide" data-slug="plan" data-dek-source="9:3" data-dek-class="slide">
  <div class="lane" data-dek-source="10:3" data-dek-class="lane">
    <div class="chevron" data-dek-source="11:5" data-dek-class="chevron">画面 <b data-dek-source="11:29">設計</b></div>
  </div>
</section>`;

let root = "";
let liveSlide = movedDown;
const copied: string[] = [];

beforeAll(async () => {
  root = realpathSync(await mkdtemp(join(tmpdir(), "dek-")));
  await writeProject(root, {
    decks: [
      {
        name: "plan",
        script,
        slides: {
          cover: slideDocument(`<section class="slide"><h2>cover</h2></section>`),
          plan: planHtml,
        },
      },
    ],
  });
  await mount();
});

afterAll(async () => {
  await unmountPlayer();
  await rm(root, { recursive: true, force: true });
});

async function mount(beforeStart?: () => void): Promise<void> {
  await mountPlayer(join(root, "decks", "plan"), {
    live: true,
    url: "http://localhost:3000/#plan",
    beforeStart: () => {
      globalThis.fetch = (async (input: RequestInfo | URL) =>
        String(input).includes("/slide/plan")
          ? new Response(liveSlide)
          : Response.json({ ok: true, positions: [] })) as typeof fetch;
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
      clipboard(true);
      beforeStart?.();
    },
  });
}

function clipboard(available: boolean): void {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: available
      ? {
          writeText: async (text: string) => {
            copied.push(text);
          },
        }
      : undefined,
  });
}

const ui = (): ShadowRoot => document.getElementById("dek-annotate")?.shadowRoot as ShadowRoot;
const part = <T extends HTMLElement = HTMLElement>(selector: string): T =>
  ui().querySelector(selector) as T;
const slide = (): HTMLElement =>
  document.querySelector('#deck > [data-slug="plan"]') as HTMLElement;
const on = (selector: string): HTMLElement => slide().querySelector(selector) as HTMLElement;

/** What the document finds under every point; happy-dom lays nothing out, so a test says. */
function under(...elements: Element[]): void {
  document.elementsFromPoint = () => elements;
}

function pointAt(type: "click" | "pointermove", init: MouseEventInit = {}): void {
  part("[data-part=layer]").dispatchEvent(
    new MouseEvent(type, { clientX: 300, clientY: 200, bubbles: true, ...init }),
  );
}

const shown = (selector: string): boolean => !part(selector).hidden;
const texts = (selector: string): string[] =>
  [...ui().querySelectorAll(selector)].map((el) => el.textContent ?? "");
const titles = (selector: string): string[] =>
  [...ui().querySelectorAll(selector)].map((el) => el.getAttribute("title") ?? "");
/** The element under the last click the note is about, by what its chip says in full. */
const chosen = (): string | null | undefined =>
  ui().querySelector("[data-part=choices] button[aria-pressed=true]")?.getAttribute("title");

describe("annotate mode", () => {
  test.serial("is off until `a`, and shows nothing on the stage while off", () => {
    expect(shown("[data-part=layer]")).toBe(false);
    expect(shown("[data-part=bar]")).toBe(false);
    expect(pressKey("a")).toBe(true);
    expect(shown("[data-part=layer]")).toBe(true);
    expect(shown("[data-part=bar]")).toBe(true);
    expect(document.getElementById("dek-annotate-toggle")?.getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  test.serial("outlines what is under the pointer and says where it is written", () => {
    under(on("b"), on(".chevron"), on(".lane"), slide());
    pointAt("pointermove");
    expect(shown("[data-part=hover]")).toBe(true);
    // happy-dom lays nothing out, so every box is 0×0.
    expect(part("[data-part=hover]").textContent).toBe("b 0×0 :10");
  });

  test.serial(
    "picks on a click and lays out what it is in as a path, without moving the deck",
    () => {
      pointAt("click");
      expect(currentSlug()).toBe("plan");
      expect(shown("[data-part=popup]")).toBe(true);
      expect(texts("[data-part=path] button")).toEqual([
        "section.slide",
        "div.lane",
        "div.chevron",
        "b",
      ]);
      expect(titles("[data-part=path] button")).toEqual([
        "section.slide :8",
        'div.lane "画面 設計" :9',
        'div.chevron "画面 設計" :10',
        'b "設計" :10',
      ]);
      expect(chosen()).toBe('b "設計" :10');
      expect(texts("[data-part=picked] li")).toEqual(['b "設計" :10']);
      expect(shown("[data-part=near]")).toBe(false);
    },
  );

  test.serial("keeps the keys typed into the note to the note", () => {
    const field = part<HTMLTextAreaElement>("textarea");
    // A key in a field of the view's shadow root reaches the document, as a browser sends it.
    for (const key of [" ", "ArrowRight", "a", "s", "p"]) {
      expect(pressKey(key, { composed: true }, field)).toBe(false);
    }
    expect(currentSlug()).toBe("plan");
    expect(location.hash).toBe("#plan");
    expect(shown("[data-part=layer]")).toBe(true);
    expect(document.body.classList.contains("is-presenter")).toBe(false);
  });

  test.serial("takes another element on the path, and Enter adds the note", () => {
    const chevron = ui().querySelector<HTMLButtonElement>(
      '[data-part=path] button[title^="div.chevron"]',
    );
    chevron?.click();
    expect(chosen()).toBe('div.chevron "画面 設計" :10');
    expect(texts("[data-part=picked] li")).toEqual(['div.chevron "画面 設計" :10']);
    const field = part<HTMLTextAreaElement>("textarea");
    field.value = "右に寄せて";
    pressKey("Enter", { composed: true }, field);
    expect(shown("[data-part=popup]")).toBe(false);
    expect(part("[data-part=count]").textContent).toBe("1 note");
    expect(texts("[data-part=marker]")).toEqual(["1"]);
  });

  test.serial("adds elements to one note with Cmd or Ctrl", () => {
    under(on(".arrow"), on(".lane"), slide());
    pointAt("click");
    under(on(".chevron"), on(".lane"), slide());
    pointAt("click", { metaKey: true });
    expect(ui().querySelectorAll("[data-part=pick]")).toHaveLength(2);
    expect(texts("[data-part=picked] li")).toEqual([
      "div.arrow :11",
      'div.chevron "画面 設計" :10',
    ]);
    part<HTMLButtonElement>("[data-part=add]").click();
    expect(part("[data-part=count]").textContent).toBe("2 notes");
  });

  test.serial("lists what is only near the click apart from its path", () => {
    under(on(".arrow"), on("b"), on(".chevron"), on(".lane"), slide());
    pointAt("click");
    expect(texts("[data-part=path] button")).toEqual(["section.slide", "div.lane", "div.arrow"]);
    expect(texts("[data-part=near] button")).toEqual(["b", "div.chevron"]);
    ui().querySelector<HTMLButtonElement>("[data-part=near] button")?.click();
    expect(chosen()).toBe('b "設計" :10');
    pressKey("Escape", { composed: true }, part("textarea"));
  });

  test.serial("copies the notes as one block, each element with its file and line", async () => {
    part<HTMLButtonElement>("[data-part=copy]").click();
    await waitFor(() => copied.length > 0);
    const text = copied.at(-1) ?? "";
    expect(text).toStartWith(
      "## Notes on decks/plan\n\nBoxes and points are in the slide's own pixels, from its top left.\n\n### Slide 2 of 2, plan",
    );
    expect(text).toContain('1. div.chevron "画面 設計" at decks/plan/slides/plan.html:10:5');
    expect(text).toContain("   > 右に寄せて");
    expect(text).toContain("2. 2 elements:\n   - div.arrow at decks/plan/slides/plan.html:11:5");
    expect(text).toContain("To see it: `dekc shot plan plan --step 0`");
    await waitFor(() => part("[data-part=status]").textContent === "Copied 2 notes");
  });

  test.serial("keeps the notes for the tab", () => {
    expect(readNotes(sessionStorage.getItem("dek-annotate:plan"))).toHaveLength(2);
  });

  test.serial("follows an element when an edit moves it down the file", async () => {
    liveSlide = movedDown;
    await dekLive({ type: "reload-slide", slug: "plan" });
    await settle();
    part<HTMLButtonElement>("[data-part=copy]").click();
    await waitFor(() => copied.at(-1)?.includes("plan.html:11:5") === true);
    expect(copied.at(-1)).toContain("   - div.arrow at decks/plan/slides/plan.html:12:5");
    expect(copied.at(-1)).not.toContain("before an edit");
  });

  test.serial("keeps a note whose element an edit took away, as written before it", async () => {
    liveSlide = arrowGone;
    await dekLive({ type: "reload-slide", slug: "plan" });
    await settle();
    part<HTMLButtonElement>("[data-part=copy]").click();
    await waitFor(() => copied.at(-1)?.includes("before an edit") === true);
    expect(copied.at(-1)).toContain(
      "   - div.arrow at decks/plan/slides/plan.html:12:5 (box 0,0 0×0), as written before an edit",
    );
    expect(texts("[data-part=marker]")).toEqual(["1"]);
  });

  test.serial("copies by hand where the page has no clipboard", async () => {
    clipboard(false);
    try {
      part<HTMLButtonElement>("[data-part=copy]").click();
      await waitFor(() => shown("[data-part=manual]"));
      expect(part<HTMLTextAreaElement>("[data-part=manual]").value).toStartWith(
        "## Notes on decks/plan",
      );
      expect(part("[data-part=status]").textContent).toBe("Press ⌘C or Ctrl+C to copy");
    } finally {
      clipboard(true);
    }
  });

  test.serial("opens a note from its marker, to change or delete it", () => {
    part<HTMLButtonElement>("[data-part=marker]").click();
    expect(part<HTMLTextAreaElement>("textarea").value).toBe("右に寄せて");
    expect(shown("[data-part=delete]")).toBe(true);
    expect(shown("[data-part=hint]")).toBe(false);
    part<HTMLButtonElement>("[data-part=delete]").click();
    expect(part("[data-part=count]").textContent).toBe("1 note");
  });

  test.serial("puts the note away when Cmd or Ctrl takes its only element out", () => {
    under(on(".lane"), slide());
    pointAt("click");
    pointAt("click", { ctrlKey: true });
    expect(shown("[data-part=popup]")).toBe(false);
  });

  test.serial("opens the popup beside what was picked, not over it", () => {
    const lane = on(".lane");
    lane.getBoundingClientRect = () =>
      ({ left: 100, top: 100, right: 400, bottom: 150, width: 300, height: 50 }) as DOMRect;
    try {
      under(lane, slide());
      pointAt("click");
      expect(part("[data-part=popup]").style.left).toBe("100px");
      expect(part("[data-part=popup]").style.top).toBe("158px");
      expect(part("[data-part=hint]").textContent).toBe("⌘/Ctrl-click adds more");
      expect(shown("[data-part=hint]")).toBe(true);
    } finally {
      delete (lane as { getBoundingClientRect?: unknown }).getBoundingClientRect;
      pressKey("Escape", { composed: true }, part("textarea"));
    }
  });

  test.serial("lets a click through the popup while Cmd or Ctrl is held", () => {
    under(on(".lane"), slide());
    pointAt("click");
    for (const key of ["Meta", "Control"]) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      expect(part("[data-part=popup]").hasAttribute("data-through")).toBe(true);
      document.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
      expect(part("[data-part=popup]").hasAttribute("data-through")).toBe(false);
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Meta", bubbles: true }));
    window.dispatchEvent(new Event("blur"));
    expect(part("[data-part=popup]").hasAttribute("data-through")).toBe(false);
    pressKey("Escape", { composed: true }, part("textarea"));
  });

  test.serial("Escape puts the note away, then leaves the mode", () => {
    under(on(".lane"), slide());
    pointAt("click");
    expect(shown("[data-part=popup]")).toBe(true);
    pressKey("Escape", { composed: true }, part("textarea"));
    expect(shown("[data-part=popup]")).toBe(false);
    expect(shown("[data-part=layer]")).toBe(true);
    pressKey("Escape");
    expect(shown("[data-part=layer]")).toBe(false);
    expect(shown("[data-part=bar]")).toBe(false);
    expect(ui().querySelectorAll("[data-part=marker]")).toHaveLength(0);
  });

  test.serial("keeps Clear away from Copy and from leaving the mode", () => {
    pressKey("a");
    const order = [...part("[data-part=pill]").children].map(
      (el) => el.getAttribute("data-part") ?? el.tagName.toLowerCase(),
    );
    expect(order).toEqual(["copy", "count", "clear", "divider", "close"]);
  });

  test.serial("Clear takes every note away, and Undo brings them back", () => {
    const kept = (): number => readNotes(sessionStorage.getItem("dek-annotate:plan")).length;
    part<HTMLButtonElement>("[data-part=clear]").click();
    expect(part("[data-part=count]").textContent).toBe("0 notes");
    expect(kept()).toBe(0);
    expect(part("[data-part=status]").textContent).toBe("Cleared 1 note");
    expect(shown("[data-part=undo]")).toBe(true);

    part<HTMLButtonElement>("[data-part=undo]").click();
    expect(part("[data-part=count]").textContent).toBe("1 note");
    expect(kept()).toBe(1);
    expect(shown("[data-part=tray]")).toBe(false);
  });

  test.serial("lets Undo go once a note is written after Clear, or the mode is left", () => {
    part<HTMLButtonElement>("[data-part=clear]").click();
    under(on(".lane"), slide());
    pointAt("click");
    part<HTMLButtonElement>("[data-part=add]").click();
    expect(part("[data-part=count]").textContent).toBe("1 note");
    expect(shown("[data-part=undo]")).toBe(false);

    part<HTMLButtonElement>("[data-part=clear]").click();
    pressKey("a");
    pressKey("a");
    expect(shown("[data-part=undo]")).toBe(false);
    expect(part("[data-part=count]").textContent).toBe("0 notes");
    pressKey("a");
  });

  test.serial("brings back the tab's notes when the page loads again", async () => {
    await unmountPlayer();
    await mount(() => {
      sessionStorage.setItem(
        "dek-annotate:plan",
        JSON.stringify({
          version: 1,
          notes: [
            {
              slug: "plan",
              step: "0",
              targets: [
                {
                  source: "10:5",
                  name: "div.chevron",
                  text: "画面 設計",
                  box: { x: 0, y: 0, width: 0, height: 0 },
                },
              ],
              text: "kept",
            },
          ],
        }),
      );
    });
    pressKey("a");
    expect(part("[data-part=count]").textContent).toBe("1 note");
    expect(texts("[data-part=marker]")).toEqual(["1"]);
  });
});
