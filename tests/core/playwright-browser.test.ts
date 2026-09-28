import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser } from "playwright";
import { parseCss } from "../../src/core/css.ts";
import { rewriteCss, shareTokensWithTransitions } from "../../src/core/css-transform.ts";
import { finishBeat } from "../../src/core/finish-beat.ts";
import { holdStarted, seekStarted, startGoPaused } from "../../src/core/in-page-go.ts";
import {
  importPlaywright,
  playwrightResolved,
  requirePlaywright,
  type VisualRequest,
} from "../../src/core/playwright.ts";
import { runVisualRequest } from "../../src/core/playwright-visual.ts";
import { overviewSheets, sheetLayout } from "../../src/core/sheet.ts";
import { shotMotion } from "../../src/core/shot/motion.ts";
import { playerScript } from "../../src/runtime/player.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

// What the Playwright worker measures, in a real Chromium. They live apart from the runner's own
// tests, which swap DEK_PLAYWRIGHT while tests in one file run at once.
const skip = !playwrightResolved() || Boolean(process.env.DEK_PLAYWRIGHT);
// One page set at a time: concurrent tests would crowd the machine past the timeout.
const browserTest = test.serial.skipIf(skip);

let browser: Browser | undefined;

beforeAll(async () => {
  if (!skip) {
    browser = await (await importPlaywright()).chromium.launch({ headless: true });
  }
});

afterAll(async () => {
  await browser?.close();
});

/** The worker's work in one shared browser: all of it but the spawn and the launch. */
function render<R extends VisualRequest>(request: R) {
  if (!browser) {
    throw new Error("no browser");
  }
  return runVisualRequest(browser, request);
}

describe("playwright worker", () => {
  browserTest("reports font size and weight with each contrast sample", async () => {
    const response = await render({
      kind: "pages",
      viewport: { width: 1280, height: 720 },
      actions: ["contrast"],
      pages: [
        {
          html: `<html><body style="margin:0;background:#fff"><section class="slide" style="background:#fff">
  <h2 style="font-size:32px;font-weight:700;color:#777">big</h2>
</section></body></html>`,
          slug: "intro",
          step: "1",
        },
      ],
    });
    const sample = response?.contrasts.find((entry) => entry.slug === "intro");
    expect(sample?.fontSize).toBeCloseTo(32, 0);
    expect(sample?.fontWeight).toBe(700);
  });
});

describe("playwright worker findings", () => {
  browserTest(
    "reports the list that runs off the slide once, and samples only elements with text",
    async () => {
      const items = Array.from({ length: 30 }, (_, i) => `<li>item ${i}</li>`).join("");
      const response = await render({
        kind: "pages",
        viewport: { width: 1280, height: 720 },
        actions: ["overflow", "contrast"],
        pages: [
          {
            html: `<html><body style="margin:0;background:#111"><section class="slide" style="width:1280px;height:720px;overflow:hidden;color:#444">
  <div class="wrap"><ul class="list" style="margin:0;font-size:40px;line-height:1">${items}</ul></div>
</section></body></html>`,
            slug: "intro",
            step: "1",
          },
        ],
      });
      expect(response?.overflows).toEqual([
        {
          slug: "intro",
          step: "1",
          box: "div.wrap",
          text: expect.stringMatching(/^item 0 item 1 /),
          by: { bottom: 480 },
          origin: "content",
        },
      ]);
      const boxes = new Set(response?.contrasts.map((sample) => sample.box));
      expect([...boxes]).toEqual(["li"]);
      expect(response?.contrasts[0]).toMatchObject({
        fg: "rgb(68, 68, 68)",
        bg: "rgb(17, 17, 17)",
      });
    },
  );
});

describe("playwright worker pages", () => {
  browserTest(
    "renders every slide fresh, in order, whatever the one before left behind",
    async () => {
      // Through the worker itself, spawn to JSON. Each slide reports whether an earlier slide's
      // global is still there, then leaves its own.
      const pages = Array.from({ length: 6 }, (_, index) => ({
        html: `<html><body style="margin:0;background:#000"><section class="slide" style="background:#000">
  <p style="color:#fff">slide ${index}</p><p id="seen" style="color:#fff"></p>
</section><script>
document.getElementById("seen").textContent = "seen " + typeof window.leftBehind;
window.leftBehind = ${index};
</script></body></html>`,
        slug: `s${index}`,
        step: "1",
      }));
      const response = await requirePlaywright({
        kind: "pages",
        viewport: { width: 1280, height: 720 },
        actions: ["contrast"],
        pages,
      });
      const texts = (response?.contrasts ?? []).map((sample) => `${sample.slug} ${sample.text}`);
      expect(texts).toEqual(
        pages.flatMap((page, index) => [
          `${page.slug} slide ${index}`,
          `${page.slug} seen undefined`,
        ]),
      );
    },
  );
});

describe("playwright worker text overflow", () => {
  browserTest("reports text that runs past the slide even when its box fits", async () => {
    const url = `https://example.com/${"a".repeat(200)}`;
    const response = await render({
      kind: "pages",
      viewport: { width: 1280, height: 720 },
      actions: ["overflow"],
      pages: [
        {
          html: `<html><body style="margin:0"><section class="slide" style="width:1280px;height:720px;overflow:hidden;padding:64px 80px;box-sizing:border-box">
  <ul style="margin:0"><li>short</li><li>${url}</li></ul>
</section></body></html>`,
          slug: "intro",
          step: "1",
        },
      ],
    });
    expect(response?.overflows).toEqual([
      {
        slug: "intro",
        step: "1",
        box: "li",
        text: url,
        by: { right: expect.any(Number) },
        origin: "content",
      },
    ]);
  });
});

// An overflow is sent to what put the element past the edge, found as a contrast's cause is: the
// script's changes taken back first, then the slide's own CSS. What overflows with both gone is the
// content itself, too much for the theme's sizes.
describe("playwright worker overflow origin", () => {
  const measure = async (body: string, slideCss = "", draw = "") => {
    const { stillPageScript } = await import("../../src/core/slide-script.ts");
    const script = draw
      ? `<script>(window.__dekSlides ||= {}).intro = { draw(slide) { ${draw} } };</script>${stillPageScript([])}`
      : "";
    const response = await render({
      kind: "pages",
      viewport: { width: 1280, height: 720 },
      actions: ["overflow"],
      pages: [
        {
          html: `<html><head><style>
body { margin: 0 }
.slide { position: relative; width: 1280px; height: 720px; font: 400 24px sans-serif }
</style><style id="dek-slide-css">${slideCss}</style></head><body><section class="slide" data-slug="intro" data-dek-step="1" data-dek-beat="0">${body}</section>${script}</body></html>`,
          slug: "intro",
          step: "1",
        },
      ],
    });
    return Object.fromEntries(
      (response?.overflows ?? []).map((found) => [found.box, found.origin]),
    );
  };

  browserTest("sends an element draw moves past the edge to the script", async () => {
    expect(
      await measure(
        `<p class="moved">moved</p>`,
        "",
        `slide.querySelector(".moved").style.translate = "1400px 0";`,
      ),
    ).toEqual({ "p.moved": "script" });
  });

  browserTest("sends an element the slide's CSS pulls past the edge to that CSS", async () => {
    expect(
      await measure(`<p class="pulled">pulled</p>`, ".slide .pulled { margin-left: -300px }"),
    ).toEqual({
      "p.pulled": "slide",
    });
  });

  browserTest("sends content too big for the theme to the slide's markup", async () => {
    expect(
      await measure(`<p class="long" style="white-space: nowrap">${"word ".repeat(200)}</p>`),
    ).toEqual({ "p.long": "content" });
  });
});

describe("playwright worker files", () => {
  browserTest(
    "shoots a page that names a screenshotPath, and measures nothing unasked",
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "dek-shoot-"));
      try {
        const screenshotPath = join(dir, "intro.png");
        const response = await render({
          kind: "pages",
          viewport: { width: 320, height: 180 },
          actions: [],
          pages: [
            {
              html: `<html><body style="margin:0;background:#f00"><section class="slide" style="width:2000px;color:#f00">x</section></body></html>`,
              slug: "intro",
              step: "1",
              screenshotPath,
            },
          ],
        });
        expect(response).toEqual({ overflows: [], contrasts: [], drawErrors: [] });
        expect((await pixelAt(screenshotPath, 10, 10)).slice(0, 5)).toEqual([320, 180, 255, 0, 0]);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );

  browserTest("prints a pdf request to its pdfPath", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dek-pdf-"));
    try {
      const pdfPath = join(dir, "demo.pdf");
      const response = await render({
        kind: "pdf",
        viewport: { width: 1280, height: 720 },
        html: '<html><body><section class="slide">a</section></body></html>',
        pdfPath,
      });
      expect(response).toEqual({});
      expect(readFileSync(pdfPath).subarray(0, 5).toString()).toBe("%PDF-");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("playwright worker morph", () => {
  browserTest("freezes a view transition at --at and produces a distinct frame", async () => {
    const { withTempProject } = await import("../helpers/project.ts");
    const { slideDocument } = await import("../helpers/html.ts");
    const { shotMorph } = await import("../../src/core/shot/morph.ts");
    const { playerScript } = await import("../../src/runtime/player.ts");
    const { defaultTheme } = await import("../../src/cli/files.ts");
    const script = `---
title: Demo
---

## problem

first

## architecture

second
`;
    const problem = slideDocument(`<section class="slide" data-layout="default">
  <h2 class="slide-title">problem</h2>
  <p class="node" data-morph="pipeline">pipeline</p>
</section>`);
    const architecture = slideDocument(`<section class="slide" data-layout="title">
  <p class="node node-parent" data-morph="pipeline">pipeline</p>
</section>`);
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script,
            theme: defaultTheme(),
            slides: { problem, architecture },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const player = await playerScript();
        const frames: Buffer[] = [];
        for (const at of [0, 0.5, 1]) {
          const [shot] = await shotMorph(deckDir, {
            from: "problem",
            to: "architecture",
            at,
            playerScript: player,
            runner: render,
          });
          frames.push(Buffer.from(await Bun.file(shot?.path ?? "").arrayBuffer()));
        }
        expect(frames[0]?.equals(frames[1] ?? Buffer.alloc(0))).toBe(false);
        expect(frames[1]?.equals(frames[2] ?? Buffer.alloc(0))).toBe(false);
        expect(frames[0]?.equals(frames[2] ?? Buffer.alloc(0))).toBe(false);
      },
    );
  });
});

describe("playwright worker still pages", () => {
  browserTest(
    "measures every animation at its end, and one that never ends at its first frame",
    async () => {
      const { stillPageScript } = await import("../../src/core/slide-script.ts");
      const response = await render({
        kind: "pages",
        viewport: { width: 1280, height: 720 },
        actions: ["contrast"],
        pages: [
          {
            html: `<html><head><style>
@keyframes rise { from { color: #151515 } to { color: #ffffff } }
@keyframes pulse { from { color: #eeeeee } to { color: #151515 } }
.entrance { animation: rise 2s both }
.pulse { animation: pulse 2s infinite }
</style></head><body style="margin:0;background:#111"><section class="slide" style="background:#111">
  <p class="entrance">entrance</p>
  <p class="pulse">pulse</p>
</section>${stillPageScript([])}</body></html>`,
            slug: "intro",
            step: "1",
          },
        ],
      });
      const { contrastRatio } = await import("../../src/core/text-contrast.ts");
      const ratios = Object.fromEntries(
        (response?.contrasts ?? []).map((sample) => [sample.text, sample.ratio]),
      );
      // Where the entrance lands, and where the pulse starts; far from where either would end.
      expect(ratios.entrance).toBeCloseTo(contrastRatio([255, 255, 255], [17, 17, 17]), 0);
      expect(ratios.pulse).toBeCloseTo(contrastRatio([238, 238, 238], [17, 17, 17]), 0);
    },
  );
});

// A still page draws each slide at the end of its beat. A draw that throws there leaves the slide
// as it was before, which no pixel measurement can tell from a slide meant to look that way.
describe("playwright worker slide scripts", () => {
  browserTest("reports a draw that throws at the end of a beat", async () => {
    const { stillPageScript } = await import("../../src/core/slide-script.ts");
    const response = await render({
      kind: "pages",
      viewport: { width: 1280, height: 720 },
      actions: ["contrast"],
      pages: [
        {
          html: `<html><body style="margin:0"><section class="slide" data-slug="intro" data-dek-step="turn" data-dek-beat="1">
  <p>hello</p>
</section><script>(window.__dekSlides ||= {}).intro = { motion: { turn: 400 }, draw(slide, frame) { if (frame.t >= 400) throw new TypeError("no bar at " + frame.t); } };</script>${stillPageScript([])}</body></html>`,
          slug: "intro",
          step: "turn",
        },
      ],
    });
    expect(response?.drawErrors).toEqual([
      { slug: "intro", step: "turn", t: 400, message: "TypeError: no bar at 400" },
    ]);
  });
});

describe("playwright worker contrast from pixels", () => {
  const measure = async (body: string, css = "") => {
    const response = await render({
      kind: "pages",
      viewport: { width: 1280, height: 720 },
      actions: ["contrast"],
      pages: [
        {
          html: `<html><head><style>
body { margin: 0; background: #000 }
.slide { position: relative; width: 1280px; height: 720px; background: #000; font: 700 40px sans-serif }
p { position: relative; margin: 0 0 40px }
${css}
</style></head><body><section class="slide">${body}</section></body></html>`,
          slug: "intro",
          step: "1",
        },
      ],
    });
    return Object.fromEntries((response?.contrasts ?? []).map((sample) => [sample.text, sample]));
  };

  browserTest("reads the gradient painted behind the text, not the color under it", async () => {
    const found = await measure(
      `<p style="color:#fff;background-color:#000;background-image:linear-gradient(#fff,#fff)">washed out</p>`,
    );
    expect(found["washed out"]).toMatchObject({
      ratio: 1,
      fg: "rgb(255, 255, 255)",
      bg: "rgb(255, 255, 255)",
    });
  });

  browserTest("counts a glow drawn by a pseudo-element as background", async () => {
    const found = await measure(
      `<p style="color:#aaa">over the glow</p>`,
      `.slide::before { content: ""; position: absolute; inset: 0; background: #fff }`,
    );
    expect(found["over the glow"]?.ratio).toBeLessThan(3);
  });

  browserTest("measures colors it cannot parse, and text that matches its background", async () => {
    const found = await measure(
      `<p style="color:oklch(0.25 0 0)">oklch</p><p style="color:#000">unseen</p>`,
    );
    expect(found.oklch?.ratio).toBeLessThan(3);
    expect(found.unseen?.ratio).toBe(1);
  });

  browserTest(
    "ignores a rule struck through the text, and measures gradient-filled text",
    async () => {
      const found = await measure(
        `<p class="struck" style="color:#fff">struck</p><p class="sheen">sheen</p>`,
        `.struck::after { content: ""; position: absolute; left: 0; right: 0; top: 50%; height: 4px; background: #333 }
.sheen { background: linear-gradient(90deg, #fff, #ddd); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent }`,
      );
      expect(found.struck?.ratio).toBeGreaterThan(15);
      expect(found.sheen?.ratio).toBeGreaterThan(10);
    },
  );
});

// A folio and a running head are drawn by ::after and ::before, as AGENTS.md says to draw them, so
// they are text the audience reads and are measured like any other.
describe("playwright worker contrast of pseudo-element text", () => {
  const measure = async (css: string) => {
    const response = await render({
      kind: "pages",
      viewport: { width: 1280, height: 720 },
      actions: ["contrast"],
      pages: [
        {
          html: `<html><head><style>
body { margin: 0; background: #000 }
.slide { position: relative; width: 1280px; height: 720px; background: #000; color: #fff; font: 400 24px sans-serif; counter-reset: folio 3 }
${css}
</style></head><body><section class="slide"><p>body text</p></section></body></html>`,
          slug: "intro",
          step: "1",
        },
      ],
    });
    return Object.fromEntries((response?.contrasts ?? []).map((sample) => [sample.box, sample]));
  };

  browserTest("measures a folio drawn from a counter by ::after", async () => {
    const found = await measure(
      `.slide::after { content: counter(folio) " / 12"; position: absolute; right: 40px; bottom: 40px; color: #1a1a1a }`,
    );
    expect(found["section.slide::after"]).toMatchObject({ text: "counter(folio) / 12" });
    expect(found["section.slide::after"]?.ratio).toBeLessThan(1.5);
    expect(found.p?.ratio).toBeGreaterThan(15);
  });

  browserTest("measures a running head drawn by ::before on any element", async () => {
    const found = await measure(`.slide p::before { content: "Chapter 1 "; color: #fff }`);
    expect(found["p::before"]?.ratio).toBeGreaterThan(15);
  });

  browserTest("leaves a glyph with no letter or digit to the background", async () => {
    const found = await measure(
      `.slide::before { content: "\\201C"; position: absolute; top: 0; left: 0; font-size: 300px; color: #222 }`,
    );
    expect(found["section.slide::before"]).toBeUndefined();
  });
});

// Decoration is marked the way the page marks it for everyone: aria-hidden. A glow that bleeds off
// the slide, or a sample of unreadable text the talk is about, is not a finding.
describe("playwright worker and decoration", () => {
  const measure = async (body: string, css = "") =>
    render({
      kind: "pages",
      viewport: { width: 1280, height: 720 },
      actions: ["overflow", "contrast"],
      pages: [
        {
          html: `<html><head><style>
body { margin: 0; background: #000 }
.slide { position: relative; width: 1280px; height: 720px; background: #000; color: #fff; font: 400 24px sans-serif }
${css}
</style></head><body><section class="slide">${body}</section></body></html>`,
          slug: "intro",
          step: "1",
        },
      ],
    });

  browserTest(
    "measures nothing an aria-hidden element draws, its pseudo text included",
    async () => {
      const response = await measure(
        `<p>read me</p><div class="glow" aria-hidden="true"><span class="faint">too faint</span></div>`,
        `.glow { position: absolute; left: -300px; top: -300px; width: 900px; height: 900px }
.faint { color: #111 }
.glow::after { content: "03"; color: #111 }`,
      );
      expect(response?.overflows).toEqual([]);
      expect(response?.contrasts.map((sample) => sample.box)).toEqual(["p"]);
    },
  );
});

describe("playwright worker contrast origin", () => {
  const measure = async (slideCss: string | undefined, draw = "") => {
    const own = slideCss === undefined ? "" : `<style id="dek-slide-css">${slideCss}</style>`;
    const { stillPageScript } = await import("../../src/core/slide-script.ts");
    const script = draw
      ? `<script>(window.__dekSlides ||= {}).intro = { draw(slide) { ${draw} } };</script>${stillPageScript([])}`
      : "";
    const response = await render({
      kind: "pages",
      viewport: { width: 1280, height: 720 },
      actions: ["contrast"],
      pages: [
        {
          html: `<html><head><style>
body { margin: 0; background: #fff }
.slide { width: 1280px; height: 720px; background: #fff; color: #111; font: 400 24px sans-serif }
.card { background: #111; padding: 16px }
.note { color: #555 }
</style>${own}</head><body><section class="slide" data-slug="intro" data-dek-step="1" data-dek-beat="0">
  <p class="card"><span class="note">theme pair</span></p>
  <p class="faint">slide color</p>
  <p class="fine">fine</p>
</section>${script}</body></html>`,
          slug: "intro",
          step: "1",
        },
      ],
    });
    return Object.fromEntries((response?.contrasts ?? []).map((sample) => [sample.text, sample]));
  };

  browserTest("blames the theme for text that fails without the slide's stylesheet", async () => {
    const found = await measure(".slide .faint { color: #ccc }");
    expect(found["theme pair"]?.origin).toBe("theme");
  });

  browserTest("blames the slide's stylesheet for text that passes without it", async () => {
    const found = await measure(".slide .faint { color: #ccc }");
    expect(found["slide color"]?.origin).toBe("slide");
  });

  browserTest("blames the theme when the slide has no stylesheet of its own", async () => {
    const found = await measure(undefined);
    expect(found["theme pair"]?.origin).toBe("theme");
  });

  // A color draw sets inline wins over any stylesheet, so neither theme.css nor the slide's CSS
  // can fix it; the hint has to send the agent to the script.
  browserTest("blames the slide script for a color its draw sets", async () => {
    const found = await measure(
      ".slide .fine { font-weight: 700 }",
      `slide.querySelector(".fine").style.color = "#eee";`,
    );
    expect(found.fine?.origin).toBe("script");
  });

  browserTest("blames the stylesheet under a draw that leaves the color alone", async () => {
    const found = await measure(
      ".slide .faint { color: #ccc }",
      `slide.querySelector(".fine").style.letterSpacing = "1px";`,
    );
    expect(found["slide color"]?.origin).toBe("slide");
  });

  browserTest("names no origin for text that passes", async () => {
    const found = await measure(".slide .faint { color: #ccc }");
    expect(found.fine).toBeDefined();
    expect(found.fine?.origin).toBeUndefined();
  });
});

describe("view transitions in a real Chromium", () => {
  const theme = readFileSync(
    join(import.meta.dir, "..", "..", "src", "theme", "default.css"),
    "utf8",
  );

  /** The duration the bundled theme's slide-in animation runs for, mid-transition. */
  async function slideInDuration(css: string): Promise<string> {
    if (!browser) {
      throw new Error("no browser");
    }
    const page = await browser.newPage();
    try {
      await page.setContent(
        `<html><head><style>${css}</style></head><body><div style="view-transition-name: slide"><section class="slide">a</section></div></body></html>`,
      );
      return await page.evaluate(async () => {
        const transition = document.startViewTransition(() => {
          document.querySelector(".slide")?.replaceChildren("b");
        });
        await transition.ready;
        const style = getComputedStyle(document.documentElement, "::view-transition-new(slide)");
        const duration = style.animationDuration;
        transition.skipTransition();
        return duration;
      });
    } finally {
      await page.close();
    }
  }

  browserTest("the slide's --step-transition reaches ::view-transition-new(slide)", async () => {
    expect(await slideInDuration(rewriteCss(parseCss(theme), shareTokensWithTransitions))).toBe(
      "0.3s",
    );
  });

  browserTest(
    "without the shared tokens, the pseudo-element sees no --step-transition",
    async () => {
      expect(await slideInDuration(theme)).toBe("0s");
    },
  );
});

describe("seeking one go in a real Chromium", () => {
  browserTest(
    "moves what the go started and leaves an earlier beat's animation finished",
    async () => {
      if (!browser) {
        throw new Error("no browser");
      }
      const page = await browser.newPage();
      try {
        await page.setContent(`<style>
@keyframes draw { to { stroke-dashoffset: 0; } }
@keyframes rise { from { opacity: 0; } }
path { stroke-dasharray: 400; stroke-dashoffset: 400; animation: draw 1200ms forwards; }
p { opacity: 1; }
.two p { animation: rise 400ms linear; }
</style><svg><path d="M0 0L100 100" stroke="red"/></svg><p>beat two</p>`);
        await page.evaluate(finishBeat);
        await page.evaluate(() => {
          window.dekGo = async () => {
            document.body.classList.add("two");
          };
        });
        await page.evaluate(startGoPaused, { slideIndex: 0, beatIndex: 1 });
        expect(await page.evaluate(holdStarted)).toBe(400);
        await page.evaluate(seekStarted, 200);
        const state = await page.evaluate(() => ({
          line: getComputedStyle(document.querySelector("path") as Element).strokeDashoffset,
          text: Number(getComputedStyle(document.querySelector("p") as Element).opacity),
        }));
        expect(state.line).toBe("0px");
        expect(state.text).toBeCloseTo(0.5, 1);
      } finally {
        await page.close();
      }
    },
  );
});

describe("a skipped view transition in a real Chromium", () => {
  browserTest("starts the go without a transition, as the talk carries on past it", async () => {
    if (!browser) {
      throw new Error("no browser");
    }
    const page = await browser.newPage();
    try {
      // Two elements sharing a view-transition-name make Chromium skip the transition.
      await page.setContent(`<style>.dup { view-transition-name: dup; }</style>
<p class="dup">a</p><p class="dup">b</p>`);
      await page.evaluate(() => {
        window.dekGo = async () => {
          const transition = document.startViewTransition(() => {
            document.body.classList.add("two");
          });
          await transition.finished.catch(() => undefined);
        };
      });
      expect(await page.evaluate(startGoPaused, { slideIndex: 0, beatIndex: 1 })).toBe(false);
      await page.evaluate(() => window.__dekPendingGo);
      expect(await page.evaluate(() => document.body.classList.contains("two"))).toBe(true);
    } finally {
      await page.close();
    }
  });
});

describe("ending a seeked go in a real Chromium", () => {
  browserTest("ends an animation seeked past its own end, so the go settles", async () => {
    if (!browser) {
      throw new Error("no browser");
    }
    const page = await browser.newPage();
    try {
      await page.setContent(`<style>
.a, .b { opacity: 0; }
.two .a { opacity: 1; transition: opacity 200ms linear; }
.two .b { opacity: 1; transition: opacity 400ms linear; }
</style><p class="a">a</p><p class="b">b</p>`);
      await page.evaluate(finishBeat);
      await page.evaluate(() => {
        window.dekGo = async () => {
          document.body.classList.add("two");
          await Promise.all(document.getAnimations().map((animation) => animation.finished));
        };
      });
      await page.evaluate(startGoPaused, { slideIndex: 0, beatIndex: 1 });
      expect(await page.evaluate(holdStarted)).toBe(400);
      await page.evaluate(seekStarted, 300);
      await page.evaluate(finishBeat);
      const settled = await page.evaluate(() =>
        Promise.race([
          window.__dekPendingGo?.then(() => true),
          new Promise((resolve) => setTimeout(() => resolve(false), 1000)),
        ]),
      );
      expect(settled).toBe(true);
    } finally {
      await page.close();
    }
  });
});

describe("holding a go at its start in a real Chromium", () => {
  browserTest("draws a transition the go began before any of it has run", async () => {
    if (!browser) {
      throw new Error("no browser");
    }
    const page = await browser.newPage({ viewport: { width: 200, height: 200 } });
    const dir = await mkdtemp(join(tmpdir(), "dek-hold-"));
    try {
      await page.setContent(`<style>
body { margin: 0; background: #fff; }
div { width: 200px; height: 200px; background: #000; opacity: 0; transition: opacity 1000ms linear; }
.two div { opacity: 1; }
</style><div></div>`);
      await page.evaluate(finishBeat);
      await page.evaluate(() => {
        window.dekGo = async () => {
          document.body.classList.add("two");
        };
      });
      await page.evaluate(startGoPaused, { slideIndex: 0, beatIndex: 1 });
      expect(await page.evaluate(holdStarted)).toBe(1000);
      await page.evaluate(seekStarted, 0);
      const path = join(dir, "start.png");
      await page.screenshot({ path });
      const [, , red] = await pixelAt(path, 100, 100);
      expect(red).toBe(255);
    } finally {
      await page.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

/** The colour of one pixel of a PNG on disk, read by the browser that drew it. */
async function pixelAt(path: string, x: number, y: number): Promise<number[]> {
  if (!browser) {
    throw new Error("no browser");
  }
  const page = await browser.newPage();
  try {
    const src = `data:image/png;base64,${readFileSync(path).toString("base64")}`;
    return await page.evaluate(
      async ({ src, x, y }) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = new OffscreenCanvas(image.width, image.height);
        const context = canvas.getContext("2d");
        context?.drawImage(image, 0, 0);
        return [image.width, image.height, ...(context?.getImageData(x, y, 1, 1).data ?? [])];
      },
      { src, x, y },
    );
  } finally {
    await page.close();
  }
}

describe("contact sheets in a real Chromium", () => {
  browserTest("draws each capture in its box, on a sheet the size of its layout", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dek-sheet-"));
    try {
      const shots = ["#ff0000", "#0000ff"].map((color, i) => ({
        html: `<html><body style="margin:0;background:${color}"></body></html>`,
        slug: `s${i + 1}`,
        step: "1",
        screenshotPath: join(dir, `s${i + 1}.png`),
      }));
      const [spec] = overviewSheets(
        shots.map((shot) => ({ image: shot.screenshotPath, label: shot.slug })),
        { slide: { width: 1280, height: 720 }, title: "demo", dir: join(dir, "sheets") },
      );
      if (!spec) {
        throw new Error("no sheet");
      }
      const response = await render({
        kind: "pages",
        viewport: { width: 1280, height: 720 },
        actions: [],
        pages: shots,
        sheets: [spec],
      });
      expect(response).toEqual({ overflows: [], contrasts: [], drawErrors: [] });
      expect(await Bun.file(spec.path).exists()).toBe(true);
      const { size, boxes } = sheetLayout(spec);
      const images = boxes.filter((box) => box.kind === "image");
      const centre = (i: number) => {
        const box = images[i];
        return [
          Math.round((box?.x ?? 0) + (box?.width ?? 0) / 2),
          Math.round((box?.y ?? 0) + (box?.height ?? 0) / 2),
        ] as const;
      };
      const [red, blue] = [
        await pixelAt(spec.path, ...centre(0)),
        await pixelAt(spec.path, ...centre(1)),
      ];
      expect(red.slice(0, 2)).toEqual([size.width, size.height]);
      expect(red.slice(2, 5)).toEqual([255, 0, 0]);
      expect(blue.slice(2, 5)).toEqual([0, 0, 255]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("shot --motion in a real Chromium", () => {
  browserTest(
    "holds the slide's entrance at each moment, and ends where dek shot does",
    async () => {
      const script = "---\ntitle: Demo\n---\n\n## intro\n\nhello\n\n## grow\n\nbody\n";
      const plain = (title: string) =>
        slideDocument(`<section class="slide"><h2 class="slide-title">${title}</h2></section>`);
      const grow = slideDocument(`<section class="slide"><div class="bar"></div></section>`);
      const css = `.slide { --bar-left: 100px; --bar-top: 400px; --bar-width: 400px; --bar-height: 40px; }
.bar { position: absolute; left: var(--bar-left); top: var(--bar-top); width: var(--bar-width); height: var(--bar-height); background: var(--fg); transform-origin: left; }
.slide.is-current .bar { animation: grow 1200ms linear; }
@keyframes grow { from { transform: scaleX(0); } }`;
      await withTempProject(
        {
          decks: [
            {
              name: "demo",
              script,
              slides: { intro: plain("intro"), grow },
              styles: { grow: css },
            },
          ],
        },
        async (root) => {
          const result = await shotMotion(join(root, "decks", "demo"), {
            slug: "grow",
            playerScript: await playerScript(),
            runner: (request) => render(request),
          });
          const [beat] = result.beats;
          expect(beat?.frames.map((frame) => frame.ms)).toEqual([0, 300, 600, 900, 1200]);
          expect(beat?.frames.at(-1)?.end).toBe(true);
          // 3/4 along the bar: still dark halfway through the entrance, filled once it ends.
          const probe = [400, 420] as const;
          const half = await pixelAt(beat?.frames[2]?.path ?? "", ...probe);
          const end = await pixelAt(beat?.frames[4]?.path ?? "", ...probe);
          expect(half[2]).toBeLessThan(64);
          expect(end[2]).toBeGreaterThan(192);
          expect(result.sheets).toHaveLength(1);
        },
      );
    },
  );
});
