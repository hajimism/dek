#!/usr/bin/env bun
import {
  importPlaywright,
  type MorphRequest,
  type VisualRequest,
  type VisualResponse,
} from "./playwright.ts";
import { type Box, contrastRatio, overflowsSlide, parseCssRgb } from "./visual.ts";

let playwright: Awaited<ReturnType<typeof importPlaywright>>;
try {
  playwright = await importPlaywright();
} catch {
  process.exit(2);
}

const stdin = await new Response(Bun.stdin).text();
let request: VisualRequest;
try {
  request = JSON.parse(stdin) as VisualRequest;
} catch {
  process.exit(2);
}

try {
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const response: VisualResponse = { overflows: [], contrasts: [] };
    for (const pageReq of request.pages) {
      const page = await browser.newPage({
        viewport: { width: request.viewport.width, height: request.viewport.height },
      });
      if (request.actions.includes("morph") && request.morph) {
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await page.setContent(pageReq.html, { waitUntil: "load" });
        await freezeTransition(page, request.morph);
        if (pageReq.screenshotPath) {
          await page.screenshot({ path: pageReq.screenshotPath, fullPage: false });
          response.screenshotPath = pageReq.screenshotPath;
        }
        continue;
      }
      await page.setContent(pageReq.html, { waitUntil: "load" });
      const measured = await measureSlide(page);
      if (request.actions.includes("overflow") && measured.slideBox) {
        for (const child of measured.children) {
          if (overflowsSlide(measured.slideBox, child.rect)) {
            response.overflows.push({
              slug: pageReq.slug ?? "",
              step: pageReq.step ?? "1",
              box: child.box,
            });
          }
        }
      }
      if (request.actions.includes("contrast")) {
        for (const sample of measured.samples) {
          const fg = parseCssRgb(sample.fg);
          const bg = parseCssRgb(sample.bg);
          if (!fg || !bg) {
            continue;
          }
          response.contrasts.push({
            slug: pageReq.slug ?? "",
            step: pageReq.step ?? "1",
            ratio: contrastRatio(fg, bg),
            fontSize: sample.fontSize,
            fontWeight: sample.fontWeight,
          });
        }
      }
      if (request.actions.includes("screenshot") && pageReq.screenshotPath) {
        await page.screenshot({ path: pageReq.screenshotPath, fullPage: false });
        response.screenshotPath = pageReq.screenshotPath;
      }
      if (request.actions.includes("pdf") && request.pdfPath) {
        await page.pdf({
          path: request.pdfPath,
          width: `${request.viewport.width}px`,
          height: `${request.viewport.height}px`,
          printBackground: true,
          margin: { top: "0", right: "0", bottom: "0", left: "0" },
        });
        response.pdfPath = request.pdfPath;
      }
    }
    process.stdout.write(`${JSON.stringify(response)}\n`);
  } finally {
    await browser.close();
  }
} catch {
  process.exit(2);
}

async function measureSlide(page: { evaluate<T>(fn: () => T | Promise<T>): Promise<T> }): Promise<{
  slideBox: Box | undefined;
  children: Array<{ box: string; rect: Box }>;
  samples: Array<{ fg: string; bg: string; fontSize: number; fontWeight: number }>;
}> {
  return page.evaluate(() => {
    const slide = document.querySelector(".slide");
    if (!slide) {
      return { slideBox: undefined, children: [], samples: [] };
    }
    const slideRect = slide.getBoundingClientRect();
    const slideBox = {
      left: slideRect.left,
      top: slideRect.top,
      right: slideRect.right,
      bottom: slideRect.bottom,
    };
    const children: Array<{ box: string; rect: Box }> = [];
    const samples: Array<{ fg: string; bg: string; fontSize: number; fontWeight: number }> = [];
    for (const el of slide.querySelectorAll("*")) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        children.push({
          box: el.tagName.toLowerCase(),
          rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        });
      }
      const style = getComputedStyle(el);
      if (Number(style.opacity) === 0) {
        continue;
      }
      if (!el.textContent?.trim()) {
        continue;
      }
      let background = style.backgroundColor;
      let current: Element | null = el.parentElement;
      while (current && (background === "transparent" || /,\s*0\)/.test(background))) {
        background = getComputedStyle(current).backgroundColor;
        current = current.parentElement;
      }
      samples.push({
        fg: style.color,
        bg: background,
        fontSize: Number.parseFloat(style.fontSize),
        fontWeight: Number(style.fontWeight) || 400,
      });
    }
    return { slideBox, children, samples };
  });
}

/**
 * Run the player's own `go` for `from`, then start `go(to)` and stop every
 * animation (view-transition pseudo-elements included) at `at` of its
 * duration. `startViewTransition` is wrapped only to get hold of the
 * transition object; the runtime is not modified.
 */
async function freezeTransition(
  page: { evaluate<T, A>(fn: (arg: A) => T | Promise<T>, arg?: A): Promise<T> },
  morph: MorphRequest,
): Promise<void> {
  await page.evaluate(async ({ from, to, at }) => {
    type Go = (next: unknown) => Promise<void>;
    const go = (window as unknown as { dekGo?: Go }).dekGo;
    if (!go) {
      return;
    }
    await go(from);
    const original = document.startViewTransition?.bind(document);
    let captured: ViewTransition | undefined;
    if (original) {
      const wrapped: typeof document.startViewTransition = (update) => {
        captured = original(update);
        return captured;
      };
      document.startViewTransition = wrapped;
    }
    const pending = go(to);
    void pending.catch(() => undefined);
    if (!captured) {
      await pending;
      return;
    }
    await captured.ready;
    for (const animation of document.getAnimations()) {
      animation.pause();
      const timing = animation.effect?.getComputedTiming();
      const duration = typeof timing?.duration === "number" ? timing.duration : 0;
      const total = (timing?.delay ?? 0) + duration;
      animation.currentTime = at * total;
    }
  }, morph);
}
