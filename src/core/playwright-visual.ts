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
import { pseudoTextBoxes } from "./pseudo-text.ts";
import { motionSheets } from "./sheet.ts";
import {
  type Box,
  measureSlideInPage,
  SLIDE_CSS_ID,
  type SlideMeasure,
  unmarkPseudoTextsInPage,
} from "./slide-measure.ts";
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

/** A contrast finding below its threshold, with the key of the text it came from. */
type Failing = { finding: ContrastFinding; key: string };

/**
 * One text the page draws: an element's own, or one a pseudo-element draws. `key` finds the same
 * text again when the page is measured a second time.
 */
type PageText = {
  key: string;
  rects: Box[];
  opacity: number;
  fontSize: number;
  fontWeight: number;
  box: string;
  text?: string;
};

/** Every text on the page, each measured once: an ancestor's sample would repeat its children's. */
async function pageTexts(page: Page, measured: SlideMeasure): Promise<PageText[]> {
  const own = measured.elements.flatMap((element, index): PageText[] =>
    element.ownText
      ? [
          {
            key: String(index),
            rects: element.textRects,
            opacity: element.opacity,
            fontSize: element.fontSize,
            fontWeight: element.fontWeight,
            box: element.box,
            ...(element.text ? { text: element.text } : {}),
          },
        ]
      : [],
  );
  if (measured.pseudoTexts.length === 0) {
    return own;
  }
  const boxes = await pseudoTextBoxes(page);
  const pseudo = measured.pseudoTexts.flatMap(({ host, pseudo, ...text }): PageText[] => {
    const key = `${host}::${pseudo}`;
    const rect = boxes.get(key);
    return rect ? [{ key, rects: [rect], ...text }] : [];
  });
  return [...own, ...pseudo];
}

/** How each text measures against what it is drawn on, in the order of `texts`. */
function textContrasts(page: Page, texts: PageText[]) {
  return measurePageTextContrasts(
    page,
    texts.map(({ rects, opacity }) => ({ rects, opacity })),
  );
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
      const texts = await pageTexts(page, measured);
      const measuredTexts = await textContrasts(page, texts);
      texts.forEach((text, at) => {
        const contrast = measuredTexts[at];
        if (!contrast) {
          return;
        }
        const finding: ContrastFinding = {
          slug,
          step,
          ratio: contrast.ratio,
          fontSize: text.fontSize,
          fontWeight: text.fontWeight,
          box: text.box,
          ...(text.text ? { text: text.text } : {}),
          fg: `rgb(${contrast.fg.join(", ")})`,
          bg: `rgb(${contrast.bg.join(", ")})`,
        };
        response.contrasts.push(finding);
        if (finding.ratio < contrastThreshold(finding)) {
          failing.push({ finding, key: text.key });
        }
      });
    }
  }
  if (pageReq.screenshotPath) {
    await page.screenshot({ path: pageReq.screenshotPath, fullPage: false });
  }
  // After the shot: what follows takes the slide's CSS away, and the page is not put back.
  await attributeContrasts(page, failing);
  await page.evaluate(unmarkPseudoTextsInPage);
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
  const texts = await pageTexts(page, await page.evaluate(measureSlideInPage));
  const contrasts = await textContrasts(page, texts);
  const alone = new Map(texts.map((text, at) => [text.key, { text, at }]));
  for (const { finding, key } of failing) {
    const theme = alone.get(key);
    const contrast = theme && contrasts[theme.at];
    if (theme && contrast) {
      finding.origin = contrast.ratio < contrastThreshold(theme.text) ? "theme" : "slide";
    }
  }
}
