#!/usr/bin/env bun
import type { Page } from "playwright";
import { freezeTransition } from "./freeze-transition.ts";
import {
  importPlaywright,
  PLAYWRIGHT_INSTALL,
  type VisualRequest,
  type VisualResponse,
} from "./playwright.ts";
import { measureSlideInPage } from "./slide-measure.ts";
import { exitWorker, readWorkerRequest } from "./spawn.ts";
import { measurePageTextContrasts } from "./text-contrast.ts";
import { findOverflows } from "./visual.ts";

let playwright: Awaited<ReturnType<typeof importPlaywright>>;
try {
  playwright = await importPlaywright();
} catch {
  exitWorker(`playwright not found; ${PLAYWRIGHT_INSTALL}`);
}

const request = await readWorkerRequest<VisualRequest>();
const response: VisualResponse = { overflows: [], contrasts: [] };

try {
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    for (const pageReq of request.pages) {
      // One page at a time: a long deck must not keep every rendered slide alive at once.
      const page = await browser.newPage({
        viewport: { width: request.viewport.width, height: request.viewport.height },
      });
      try {
        await visitPage(page, pageReq);
      } finally {
        await page.close();
      }
    }
    process.stdout.write(`${JSON.stringify(response)}\n`);
  } finally {
    await browser.close();
  }
} catch (error) {
  exitWorker(error);
}

/** Runs the requested actions on one page and adds what it measured to `response`. */
async function visitPage(page: Page, pageReq: VisualRequest["pages"][number]): Promise<void> {
  if (request.actions.includes("morph") && request.morph) {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setContent(pageReq.html, { waitUntil: "load" });
    await freezeTransition(page, request.morph);
    if (pageReq.screenshotPath) {
      await page.screenshot({ path: pageReq.screenshotPath, fullPage: false });
      response.screenshotPath = pageReq.screenshotPath;
    }
    return;
  }
  await page.setContent(pageReq.html, { waitUntil: "load" });
  const measured = await page.evaluate(measureSlideInPage);
  const slug = pageReq.slug ?? "";
  const step = pageReq.step ?? "1";
  if (request.actions.includes("overflow") && measured.slideBox) {
    for (const overflow of findOverflows(measured.slideBox, measured.elements)) {
      response.overflows.push({ slug, step, ...overflow });
    }
  }
  if (request.actions.includes("contrast")) {
    // Only text the element draws itself; an ancestor's sample would repeat it.
    const texts = measured.elements.filter((element) => element.ownText);
    const measuredTexts = await measurePageTextContrasts(
      page,
      texts.map((element) => ({ rects: element.textRects, opacity: element.opacity })),
    );
    texts.forEach((element, index) => {
      const contrast = measuredTexts[index];
      if (!contrast) {
        return;
      }
      response.contrasts.push({
        slug,
        step,
        ratio: contrast.ratio,
        fontSize: element.fontSize,
        fontWeight: element.fontWeight,
        box: element.box,
        ...(element.text ? { text: element.text } : {}),
        fg: `rgb(${contrast.fg.join(", ")})`,
        bg: `rgb(${contrast.bg.join(", ")})`,
      });
    });
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
