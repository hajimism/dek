import type { Browser, BrowserContext, Page } from "playwright";
import { freezeTransition, loadVideoDoc } from "./capture-go.ts";
import { findOverflows } from "./overflow.ts";
import { visitInPages } from "./page-pool.ts";
import type {
  DoneResponse,
  MorphRequest,
  MotionRequest,
  MotionResponse,
  PagesRequest,
  PagesResponse,
  PdfRequest,
  ResponseTo,
  VisualPage,
  VisualRequest,
} from "./playwright.ts";
import { captureMotion } from "./playwright-motion.ts";
import { renderSheets } from "./playwright-sheet.ts";
import { motionSheets } from "./sheet.ts";
import { measureSlideInPage } from "./slide-measure.ts";
import { measurePageTextContrasts } from "./text-contrast.ts";

/**
 * Answers a visual request in a running browser: what the Playwright worker
 * does between launching Chromium and writing its JSON. Findings keep the
 * order of the request's pages.
 */
export async function runVisualRequest<R extends VisualRequest>(
  browser: Browser,
  request: R,
): Promise<ResponseTo<R>> {
  const context = await browser.newContext({ viewport: request.viewport });
  try {
    return (await answer(context, request)) as ResponseTo<R>;
  } finally {
    await context.close();
  }
}

function answer(context: BrowserContext, request: VisualRequest) {
  switch (request.kind) {
    case "pages":
      return visitPages(context, request);
    case "pdf":
      return printPdf(context, request);
    case "morph":
      return shootMorph(context, request);
    case "motion":
      return shootMotion(context, request);
    default: {
      const unknown: never = request;
      throw new Error(`unknown visual request ${JSON.stringify(unknown)}`);
    }
  }
}

/** The whole print document as one PDF, a page per slide. */
async function printPdf(context: BrowserContext, request: PdfRequest): Promise<DoneResponse> {
  const page = await context.newPage();
  await page.setContent(request.html, { waitUntil: "load" });
  await page.pdf({
    path: request.pdfPath,
    width: `${request.viewport.width}px`,
    height: `${request.viewport.height}px`,
    printBackground: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
  });
  return {};
}

/** The move between two slides, frozen at a moment and shot. */
async function shootMorph(context: BrowserContext, request: MorphRequest): Promise<DoneResponse> {
  const page = await context.newPage();
  await loadVideoDoc(page, request.html);
  await freezeTransition(page, request.morph);
  await page.screenshot({ path: request.screenshotPath, fullPage: false });
  return {};
}

/** A slide's beats in motion, then the sheets that tile them. */
async function shootMotion(
  context: BrowserContext,
  request: MotionRequest,
): Promise<MotionResponse> {
  const motion = await captureMotion(await context.newPage(), request.html, request.motion);
  const sheets = await renderSheets(
    motionSheets(motion, {
      slide: request.viewport,
      title: request.motion.title,
      dir: request.motion.dir,
    }),
    () => context.newPage(),
  );
  return { motion, sheets };
}

/** Every page measured and shot as the request asks; then its sheets. */
async function visitPages(context: BrowserContext, request: PagesRequest): Promise<PagesResponse> {
  const found = await visitInPages(
    request.pages,
    () => context.newPage(),
    (page, pageReq) => visitPage(page, pageReq, request.actions),
  );
  // Sheets come last: they tile what the pages above just wrote.
  if (request.sheets && request.sheets.length > 0) {
    await renderSheets(request.sheets, () => context.newPage());
  }
  return {
    overflows: found.flatMap((page) => page.overflows),
    contrasts: found.flatMap((page) => page.contrasts),
  };
}

/** Measures one page as `actions` asks, and shoots it when it names a `screenshotPath`. */
async function visitPage(
  page: Page,
  pageReq: VisualPage,
  actions: PagesRequest["actions"],
): Promise<PagesResponse> {
  const response: PagesResponse = { overflows: [], contrasts: [] };
  await page.setContent(pageReq.html, { waitUntil: "load" });
  const { slug, step } = pageReq;
  if (actions.length > 0) {
    const measured = await page.evaluate(measureSlideInPage);
    if (actions.includes("overflow") && measured.slideBox) {
      for (const overflow of findOverflows(measured.slideBox, measured.elements)) {
        response.overflows.push({ slug, step, ...overflow });
      }
    }
    if (actions.includes("contrast")) {
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
  }
  if (pageReq.screenshotPath) {
    await page.screenshot({ path: pageReq.screenshotPath, fullPage: false });
  }
  return response;
}
