import type { Browser, Page } from "playwright";
import { freezeTransition } from "./freeze-transition.ts";
import { visitInPages } from "./page-pool.ts";
import type { VisualPage, VisualRequest, VisualResponse } from "./playwright.ts";
import { measureSlideInPage } from "./slide-measure.ts";
import { measurePageTextContrasts } from "./text-contrast.ts";
import { findOverflows } from "./visual.ts";

/**
 * Answers a visual request in a running browser: what the Playwright worker
 * does between launching Chromium and writing its JSON. Findings keep the
 * order of the request's pages.
 */
export async function runVisualRequest(
  browser: Browser,
  request: VisualRequest,
): Promise<VisualResponse> {
  const context = await browser.newContext({ viewport: request.viewport });
  try {
    const found = await visitInPages(
      request.pages,
      () => context.newPage(),
      (page, pageReq) => visitPage(page, pageReq, request),
    );
    const response: VisualResponse = { overflows: [], contrasts: [] };
    for (const page of found) {
      response.overflows.push(...page.overflows);
      response.contrasts.push(...page.contrasts);
      if (page.screenshotPath) {
        response.screenshotPath = page.screenshotPath;
      }
      if (page.pdfPath) {
        response.pdfPath = page.pdfPath;
      }
    }
    return response;
  } finally {
    await context.close();
  }
}

/** Runs the requested actions on one page and returns what it measured. */
async function visitPage(
  page: Page,
  pageReq: VisualPage,
  request: VisualRequest,
): Promise<VisualResponse> {
  const response: VisualResponse = { overflows: [], contrasts: [] };
  if (request.actions.includes("morph") && request.morph) {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setContent(pageReq.html, { waitUntil: "load" });
    await freezeTransition(page, request.morph);
    if (pageReq.screenshotPath) {
      await page.screenshot({ path: pageReq.screenshotPath, fullPage: false });
      response.screenshotPath = pageReq.screenshotPath;
    }
    return response;
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
  return response;
}
