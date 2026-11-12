import { afterAll, beforeAll, describe, expect } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultTheme } from "../../src/cli/files.ts";
import { renderDeckHtml } from "../../src/core/document.ts";
import type { EmbedMessage } from "../../src/core/embed-protocol.ts";
import { playwrightResolved } from "../../src/core/playwright.ts";
import { playerScript } from "../../src/runtime/player.ts";
import { serialBrowserTest, sharedBrowser } from "../helpers/browser.ts";
import { slideDocument } from "../helpers/html.ts";
import { writeProject } from "../helpers/project.ts";
import { WAIT_MS } from "../helpers/wait.ts";

// The embed API as dek.pub uses it: a built deck served from one origin, framed by a page on
// another, in the sandbox dek.pub gives it. postMessage across origins, hit testing, and the
// shadow DOM's pins are what happy-dom does not have.
const skip = !playwrightResolved() || Boolean(process.env.DEK_PLAYWRIGHT);
const browserTest = serialBrowserTest(skip);
const withBrowser = sharedBrowser();

/** The part of Playwright's page and frames these tests drive, beyond dek's own typing. */
type Locator = {
  boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null>;
  first(): Locator;
  waitFor(options: { timeout: number }): Promise<void>;
  allTextContents(): Promise<string[]>;
  click(): Promise<void>;
};
type Frame = {
  url(): string;
  evaluate<T>(fn: () => T): Promise<T>;
  waitForFunction(
    fn: () => boolean,
    arg: undefined,
    options: { timeout: number },
  ): Promise<unknown>;
  locator(selector: string): Locator;
};
type Page = {
  goto(url: string): Promise<unknown>;
  evaluate<T, A>(fn: (arg: A) => T, arg: A): Promise<T>;
  waitForFunction<A>(
    fn: (arg: A) => boolean,
    arg: A,
    options: { timeout: number },
  ): Promise<unknown>;
  mainFrame(): Frame;
  frames(): Frame[];
  mouse: { move(x: number, y: number): Promise<void>; click(x: number, y: number): Promise<void> };
  keyboard: { press(key: string): Promise<void> };
  on(event: "pageerror", listener: (error: Error) => void): void;
  close(): Promise<void>;
};

const SANDBOX = "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox";

// 4:3, so the size dek:ready names is not the default one.
const script = `---
title: Demo
ratio: "4:3"
---

## intro

秘密にしたい台本の一文。

## plan

計画を話す。

### chart {#chart}

グラフを見せる。
`;

/** Where the chevron is on its slide, in the slide's own pixels. */
const CHEVRON = { x: 120, y: 240, width: 320, height: 80 };

let root = "";
let deckServer: ReturnType<typeof Bun.serve> | undefined;
let pageServer: ReturnType<typeof Bun.serve> | undefined;

beforeAll(async () => {
  if (skip) {
    return;
  }
  root = realpathSync(await mkdtemp(join(tmpdir(), "dek-embed-browser-")));
  await writeProject(root, {
    decks: [
      {
        name: "demo",
        script,
        theme: defaultTheme(),
        slides: {
          // A decorative shape that takes no pointer can still be picked.
          intro: slideDocument(`<section class="slide">
  <div class="chevron is-lit" style="position: absolute; left: ${CHEVRON.x}px; top: ${CHEVRON.y}px; width: ${CHEVRON.width}px; height: ${CHEVRON.height}px; pointer-events: none; background: #345;">cut short</div>
</section>`),
          plan: slideDocument(
            `<section class="slide"><h2 class="slide-title">plan</h2><p data-step="chart">chart</p></section>`,
          ),
        },
      },
    ],
  });
  const html = renderDeckHtml(join(root, "decks", "demo"), {
    playerScript: await playerScript(),
    target: { kind: "build" },
  });
  deckServer = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }),
  });
  const deckUrl = `http://127.0.0.1:${deckServer.port}/demo.html`;
  // The framing page listens before it sets the frame's src, so it hears dek:ready.
  const framing = `<!doctype html>
<html><body style="margin: 0">
<iframe id="deck" sandbox="${SANDBOX}" style="position: fixed; left: 0; top: 0; width: 1280px; height: 720px; border: 0"></iframe>
<script>
  const frame = document.getElementById("deck");
  window.heard = [];
  addEventListener("message", (event) => {
    if (event.source === frame.contentWindow) {
      heard.push({ origin: event.origin, data: event.data });
    }
  });
  window.tell = (data) => frame.contentWindow.postMessage(data, "*");
  frame.src = ${JSON.stringify(deckUrl)};
</script>
</body></html>`;
  pageServer = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(framing, { headers: { "content-type": "text/html; charset=utf-8" } }),
  });
});

afterAll(async () => {
  deckServer?.stop(true);
  pageServer?.stop(true);
  if (root) {
    await rm(root, { recursive: true, force: true });
  }
});

type Heard = { origin: string; data: EmbedMessage };

const heard = (page: Page): Promise<Heard[]> =>
  page.evaluate(() => (window as unknown as { heard: Heard[] }).heard, undefined);

/** The messages heard so far once one of `type` is among them, after `after` of them. */
async function waitFor(page: Page, type: string, after = 0): Promise<Heard> {
  await page.waitForFunction(
    ({ type, after }) =>
      (window as unknown as { heard: Heard[] }).heard
        .slice(after)
        .some((each) => each.data.type === type),
    { type, after },
    { timeout: WAIT_MS },
  );
  const found = (await heard(page)).slice(after).find((each) => each.data.type === type);
  return found as Heard;
}

const tell = (page: Page, data: unknown): Promise<void> =>
  page.evaluate(
    (data) => (window as unknown as { tell: (data: unknown) => void }).tell(data),
    data,
  );

function deckFrame(page: Page): Frame {
  const frame = page.frames().find((each) => each.url().startsWith("http://127.0.0.1:"));
  if (!frame || frame === page.mainFrame()) {
    throw new Error("the deck's frame is not there");
  }
  return frame;
}

describe("a built deck framed by a page on another origin", () => {
  browserTest("talks to the framing page through the embed API", async () => {
    await withBrowser(async (browser) => {
      const page = (await browser.newPage({
        viewport: { width: 1280, height: 720 },
      })) as unknown as Page;
      const errors: Error[] = [];
      page.on("pageerror", (error) => errors.push(error));
      try {
        // Reached as localhost, the framing page is another site than the deck's 127.0.0.1.
        await page.goto(`http://localhost:${pageServer?.port}/`);
        const deckOrigin = `http://127.0.0.1:${deckServer?.port}`;

        const ready = await waitFor(page, "dek:ready");
        expect(ready).toEqual({
          origin: deckOrigin,
          data: {
            type: "dek:ready",
            protocol: 1,
            deck: "demo",
            size: { width: 1024, height: 768 },
            slides: [
              { slug: "intro", steps: ["0"] },
              { slug: "plan", steps: ["0", "chart"] },
            ],
            current: { slug: "intro", step: "0", index: 0 },
          },
        });
        const frame = deckFrame(page);

        // goto moves the deck, writes its hash, and the deck says where it went.
        let count = (await heard(page)).length;
        await tell(page, { type: "dek:goto", slug: "plan", step: "chart" });
        expect((await waitFor(page, "dek:moved", count)).data).toEqual({
          type: "dek:moved",
          slug: "plan",
          step: "chart",
          index: 1,
        });
        expect(await frame.evaluate(() => location.hash)).toBe("#plan/1");
        count = (await heard(page)).length;
        await tell(page, { type: "dek:goto", slug: "intro" });
        await waitFor(page, "dek:moved", count);
        // dek:moved comes as the move starts; the slide takes the pointer once its transition ends.
        await frame.waitForFunction(() => document.getAnimations().length === 0, undefined, {
          timeout: WAIT_MS,
        });

        // Pick mode: the element under the pointer is outlined, and a click picks it, measured on
        // the slide, without moving the deck.
        await tell(page, { type: "dek:pick", on: true });
        const chevron = await frame.locator("#deck .chevron").boundingBox();
        if (!chevron) {
          throw new Error("the chevron has no box");
        }
        const center = { x: chevron.x + chevron.width / 2, y: chevron.y + chevron.height / 2 };
        await page.mouse.move(center.x, center.y);
        await frame.waitForFunction(
          () =>
            document
              .getElementById("dek-embed")
              ?.shadowRoot?.querySelector<HTMLElement>("[data-part=hover]")?.hidden === false,
          undefined,
          { timeout: WAIT_MS },
        );
        count = (await heard(page)).length;
        await page.mouse.click(center.x, center.y);
        expect((await waitFor(page, "dek:picked", count)).data).toEqual({
          type: "dek:picked",
          slug: "intro",
          step: "0",
          target: {
            kind: "element",
            path: "slides/intro.html",
            name: "div.chevron.is-lit",
            text: "cut short",
            box: CHEVRON,
          },
        });
        expect(await frame.evaluate(() => location.hash)).toBe("#intro");

        // Escape leaves pick mode and says so.
        count = (await heard(page)).length;
        await page.keyboard.press("Escape");
        expect((await waitFor(page, "dek:pick-cancel", count)).data).toEqual({
          type: "dek:pick-cancel",
        });

        // A mark is a numbered pin on the top right corner of its box; clicking it says which.
        await tell(page, {
          type: "dek:marks",
          marks: [
            { id: "c_7", number: 3, slug: "intro", step: "0", box: CHEVRON },
            { id: "c_8", number: 4, slug: "plan", step: "chart", box: CHEVRON },
          ],
        });
        const pin = frame.locator("[data-part=pin]");
        await pin.first().waitFor({ timeout: WAIT_MS });
        expect(await pin.allTextContents()).toEqual(["3"]);
        const pinBox = await pin.boundingBox();
        expect(pinBox).not.toBeNull();
        if (pinBox) {
          expect(Math.abs(pinBox.x + pinBox.width / 2 - (chevron.x + chevron.width))).toBeLessThan(
            2,
          );
          expect(Math.abs(pinBox.y + pinBox.height / 2 - chevron.y)).toBeLessThan(2);
        }
        count = (await heard(page)).length;
        await pin.click();
        expect((await waitFor(page, "dek:mark", count)).data).toEqual({
          type: "dek:mark",
          id: "c_7",
        });
        expect(await frame.evaluate(() => location.hash)).toBe("#intro");

        // Nothing it said carries the script.
        expect(JSON.stringify(await heard(page))).not.toContain("秘密");
        expect(errors).toEqual([]);
      } finally {
        await page.close();
      }
    });
  });
});
