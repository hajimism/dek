import type { Browser, BrowserContext, Page } from "playwright";
import { freezeTransition, loadVideoDoc } from "./capture-go.ts";
import { finishBeat } from "./finish-beat.ts";
import { findOverflows } from "./overflow.ts";
import { visitInPages } from "./page-pool.ts";
import type {
  ContrastFinding,
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
import { type MeasuredElement, measureSlideInPage, SLIDE_CSS_ID } from "./slide-measure.ts";
import { contrastThreshold, measurePageTextContrasts } from "./text-contrast.ts";

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

/** A contrast finding below its threshold, with the measured element it came from. */
type Failing = { finding: ContrastFinding; element: number };

/** The elements that draw text of their own, by their index among the slide's elements. */
function ownTexts(elements: MeasuredElement[]): Array<{ element: MeasuredElement; index: number }> {
  // Only text the element draws itself; an ancestor's sample would repeat it.
  return elements.flatMap((element, index) => (element.ownText ? [{ element, index }] : []));
}

/** Measures one page as `actions` asks, and shoots it when it names a `screenshotPath`. */
async function visitPage(
  page: Page,
  pageReq: VisualPage,
  actions: PagesRequest["actions"],
): Promise<PagesResponse> {
  const response: PagesResponse = { overflows: [], contrasts: [] };
  const failing: Failing[] = [];
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
      const texts = ownTexts(measured.elements);
      const measuredTexts = await measurePageTextContrasts(
        page,
        texts.map(({ element }) => ({ rects: element.textRects, opacity: element.opacity })),
      );
      texts.forEach(({ element, index }, at) => {
        const contrast = measuredTexts[at];
        if (!contrast) {
          return;
        }
        const finding: ContrastFinding = {
          slug,
          step,
          ratio: contrast.ratio,
          fontSize: element.fontSize,
          fontWeight: element.fontWeight,
          box: element.box,
          ...(element.text ? { text: element.text } : {}),
          fg: `rgb(${contrast.fg.join(", ")})`,
          bg: `rgb(${contrast.bg.join(", ")})`,
        };
        response.contrasts.push(finding);
        if (finding.ratio < contrastThreshold(finding)) {
          failing.push({ finding, element: index });
        }
      });
    }
  }
  if (pageReq.screenshotPath) {
    await page.screenshot({ path: pageReq.screenshotPath, fullPage: false });
  }
  // After the shot: what follows takes the slide's CSS away, and the page is not put back.
  await attributeContrasts(page, failing);
  return response;
}

/**
 * Says which stylesheet draws each failing text below its threshold. The page is measured again
 * with the slide's own CSS taken away and the beat finished anew: text still below its threshold
 * is the theme's to fix, text that clears it the slide's. With no CSS of its own, the slide
 * leaves every color to the theme.
 */
async function attributeContrasts(page: Page, failing: Failing[]): Promise<void> {
  if (failing.length === 0) {
    return;
  }
  const hadOwn = await page.evaluate((id) => {
    const style = document.getElementById(id);
    style?.remove();
    return style !== null;
  }, SLIDE_CSS_ID);
  if (!hadOwn) {
    for (const { finding } of failing) {
      finding.origin = "theme";
    }
    return;
  }
  // Transitions and animations the theme now applies would otherwise be caught midway.
  await page.evaluate(finishBeat);
  const texts = ownTexts((await page.evaluate(measureSlideInPage)).elements);
  const contrasts = await measurePageTextContrasts(
    page,
    texts.map(({ element }) => ({ rects: element.textRects, opacity: element.opacity })),
  );
  const alone = new Map(texts.map(({ element, index }, at) => [index, { element, at }]));
  for (const { finding, element } of failing) {
    const theme = alone.get(element);
    const contrast = theme && contrasts[theme.at];
    if (theme && contrast) {
      finding.origin = contrast.ratio < contrastThreshold(theme.element) ? "theme" : "slide";
    }
  }
}
