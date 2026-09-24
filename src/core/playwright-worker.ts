#!/usr/bin/env bun
import { freezeTransition } from "./freeze-transition.ts";
import { importPlaywright, type VisualRequest, type VisualResponse } from "./playwright.ts";
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
