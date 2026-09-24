import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { defaultPlaywrightRunner, playwrightResolved } from "../../src/core/playwright.ts";

// These drive a real Chromium through the worker. They live apart from the runner's own tests,
// which swap DEK_PLAYWRIGHT while tests in one file run at once.
const skip = !playwrightResolved() || Boolean(process.env.DEK_PLAYWRIGHT);
// One browser at a time: a Chromium per concurrent test would crowd the machine past the timeout.
const browserTest = test.serial.skipIf(skip);

describe("playwright worker", () => {
  browserTest("reports font size and weight with each contrast sample", async () => {
    const response = await defaultPlaywrightRunner({
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
      const response = await defaultPlaywrightRunner({
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

describe("playwright worker text overflow", () => {
  browserTest("reports text that runs past the slide even when its box fits", async () => {
    const url = `https://example.com/${"a".repeat(200)}`;
    const response = await defaultPlaywrightRunner({
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
      },
    ]);
  });
});

describe("playwright worker morph", () => {
  browserTest("freezes a view transition at --at and produces a distinct frame", async () => {
    const { withTempProject } = await import("../helpers/project.ts");
    const { slideDocument } = await import("../helpers/html.ts");
    const { shotMorph } = await import("../../src/core/shot.ts");
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
      const response = await defaultPlaywrightRunner({
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
      const { contrastRatio } = await import("../../src/core/visual.ts");
      const ratios = Object.fromEntries(
        (response?.contrasts ?? []).map((sample) => [sample.text, sample.ratio]),
      );
      // Where the entrance lands, and where the pulse starts; far from where either would end.
      expect(ratios.entrance).toBeCloseTo(contrastRatio([255, 255, 255], [17, 17, 17]), 0);
      expect(ratios.pulse).toBeCloseTo(contrastRatio([238, 238, 238], [17, 17, 17]), 0);
    },
  );
});

describe("playwright worker contrast from pixels", () => {
  const measure = async (body: string, css = "") => {
    const response = await defaultPlaywrightRunner({
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
