import type { Browser, BrowserContext, Page } from "playwright";
import { freezeTransition, loadVideoDoc } from "./capture-go.ts";
import { measureFill } from "./fill.ts";
import { finishBeat } from "./finish-beat.ts";
import {
  crossesEdge,
  findClippedText,
  findCollisions,
  findOverflows,
  type OverflowOrigin,
  samePlace,
} from "./overflow.ts";
import { visitInPages } from "./page-pool.ts";
import {
  keepOnlyTextInPage,
  PDF_JPEG_QUALITY,
  PDF_SLIDES,
  PDF_TEXT_CSS,
  pdfPictureType,
  photoSharesInPage,
  setSlidePictureInPage,
  slideBoxesInPage,
} from "./pdf-text.ts";
import type {
  ContrastFinding,
  ContrastOrigin,
  DoneResponse,
  MorphRequest,
  MotionRequest,
  MotionResponse,
  PagesRequest,
  PagesResponse,
  PdfRequest,
  PptxPictureFile,
  PptxRequest,
  PptxResponse,
  ResponseTo,
  VisualPage,
  VisualRequest,
} from "./playwright.ts";
import { captureMotion } from "./playwright-motion.ts";
import { renderSheets } from "./playwright-sheet.ts";
import { mapPictures } from "./pptx-package.ts";
import {
  describePptxPicturesInPage,
  hidePptxLiftedInPage,
  measurePptxPaintInPage,
  measurePptxThemeInPage,
  PPTX_PSEUDO_ATTR,
  pptxFontProbesInPage,
  pptxPictureEmptyInPage,
  pptxSvgInPage,
  SVG_CHECKED,
  SVG_PAINT,
  showOnlyPptxNodeInPage,
} from "./pptx-paint.ts";
import { planPptxLayers, pptxPageFacts } from "./pptx-plan.ts";
import { measurePptxTextsInPage, PPTX_OWNER_ATTR } from "./pptx-text.ts";
import type { PptxPageTheme } from "./pptx-theme.ts";
import { pseudoElementBoxes, pseudoTextBoxes } from "./pseudo-text.ts";
import { motionSheets } from "./sheet.ts";
import {
  type Box,
  measureSlideInPage,
  SLIDE_CSS_ID,
  type SlideMeasure,
  unmarkPseudoTextsInPage,
} from "./slide-measure.ts";
import { contrastThreshold, measureGlyphBoxes, measurePageTextContrasts } from "./text-contrast.ts";

/**
 * Answers a visual request in a running browser: what the Playwright worker
 * does between launching Chromium and writing its JSON. Findings keep the
 * order of the request's pages.
 */
export async function runVisualRequest<R extends VisualRequest>(
  browser: Browser,
  request: R,
): Promise<ResponseTo<R>> {
  // A PPTX's and a PDF's pictures are shown full screen, so they are drawn at twice the slide's
  // size. A deck is self-contained (DEK020), so the page needs no network, and a ref's slide
  // scripts get none.
  const context = await browser.newContext({
    viewport: request.viewport,
    offline: true,
    ...(request.kind === "pptx" || request.kind === "pdf" ? { deviceScaleFactor: 2 } : {}),
  });
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
    case "pptx":
      return shootPptx(context, request);
    default: {
      const unknown: never = request;
      throw new Error(`unknown visual request ${JSON.stringify(unknown)}`);
    }
  }
}

/**
 * The whole print document as one PDF, a page per slide: each slide shot as print draws it, then
 * printed as that picture with its text laid over it, unseen.
 */
async function printPdf(context: BrowserContext, request: PdfRequest): Promise<DoneResponse> {
  const page = await context.newPage();
  await page.setContent(request.html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.emulateMedia({ media: "print" });
  // A slide that shows photographs is shot as a JPEG too, and kept as one where it is smaller.
  const shares = await page.evaluate(photoSharesInPage, PDF_SLIDES);
  const pictures: string[] = [];
  for (const [index, clip] of (await page.evaluate(slideBoxesInPage, PDF_SLIDES)).entries()) {
    const share = shares[index] ?? 0;
    const png = await page.screenshot({ clip, fullPage: true });
    const jpeg =
      pdfPictureType({ png: png.length, jpeg: 0 }, share) === "jpeg"
        ? await page.screenshot({ clip, fullPage: true, type: "jpeg", quality: PDF_JPEG_QUALITY })
        : undefined;
    const kept =
      jpeg && pdfPictureType({ png: png.length, jpeg: jpeg.length }, share) === "jpeg"
        ? { type: "jpeg", data: jpeg }
        : { type: "png", data: png };
    pictures.push(`data:image/${kept.type};base64,${kept.data.toString("base64")}`);
  }
  await page.evaluate(keepOnlyTextInPage, { selector: PDF_SLIDES, css: PDF_TEXT_CSS });
  for (const [index, picture] of pictures.entries()) {
    await page.evaluate(setSlidePictureInPage, { selector: PDF_SLIDES, index, picture });
  }
  await page.pdf({
    path: request.pdfPath,
    width: `${request.viewport.width}px`,
    height: `${request.viewport.height}px`,
    printBackground: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
  });
  return {};
}

/**
 * Each slide's text and paint measured; what is laid over the picture planned, each picture
 * drawn alone, and the slide shot without what was laid over it, page by page.
 */
async function shootPptx(context: BrowserContext, request: PptxRequest): Promise<PptxResponse> {
  const slides = await visitInPages(
    request.pages,
    () => context.newPage(),
    async (page, pageReq) => {
      await page.setContent(pageReq.html, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const paint = {
        ...(await page.evaluate(measurePptxPaintInPage)),
        described: await page.evaluate(describePptxPicturesInPage),
      };
      const texts = await page.evaluate(measurePptxTextsInPage);
      const fonts = await platformFonts(page);
      const placed = await pseudoElementBoxes(page, PPTX_PSEUDO_ATTR, "border", [
        "before",
        "after",
        "marker",
      ]);
      for (const run of [
        ...texts.boxes.flatMap((box) => box.runs),
        ...texts.blocks.flatMap((block) => block.runs),
      ]) {
        const font = fonts.get(run.owner);
        if (font !== undefined) {
          run.font = font;
        }
      }
      const plan = planPptxLayers(pptxPageFacts(paint, texts, placed));

      const files = new Map<number, PptxPictureFile>();
      for (const [index, node] of plan.lifted.pictures.entries()) {
        const measured = paint.nodes[node];
        const rect =
          (measured?.paint?.kind === "picture" ? measured.paint.extent : undefined) ??
          measured?.rect;
        if (!rect) {
          continue;
        }
        const svg = await page.evaluate(pptxSvgInPage, {
          node,
          paint: SVG_PAINT,
          checked: SVG_CHECKED,
        });
        const png = pageReq.screenshotPath.replace(/\.png$/, `-${index + 1}.png`);
        await page.evaluate(showOnlyPptxNodeInPage, node);
        await page.screenshot({
          path: png,
          omitBackground: true,
          clip: {
            x: paint.origin.left + rect.left,
            y: paint.origin.top + rect.top,
            width: rect.right - rect.left,
            height: rect.bottom - rect.top,
          },
        });
        await page.evaluate(showOnlyPptxNodeInPage, null);
        files.set(node, svg === undefined ? { png } : { png, svg });
      }
      const layers = mapPictures(plan.layers, ({ node, ...picture }) => ({
        ...picture,
        ...(files.get(node) ?? { png: "" }),
      }));
      // With the background PowerPoint's, the slide is shot on nothing, and a picture with
      // nothing left in it is no picture.
      const { background } = plan;
      await page.evaluate(hidePptxLiftedInPage, {
        ...plan.lifted,
        background: background !== undefined,
      });
      const shot = await page.screenshot({
        path: pageReq.screenshotPath,
        fullPage: false,
        ...(background ? { omitBackground: true } : {}),
      });
      const empty =
        background !== undefined &&
        (await page.evaluate(
          pptxPictureEmptyInPage,
          `data:image/png;base64,${shot.toString("base64")}`,
        ));
      return {
        slug: pageReq.slug,
        description: plan.description,
        layers,
        picture: !empty,
        ...(background ? { background } : {}),
        theme: await pageTheme(page),
      };
    },
  );
  return { slides };
}

/**
 * What the slide says of the deck's theme: its color tokens, and each font token as the
 * `font-family` it is and the faces Chromium drew Latin and East Asian text in with it. Measured
 * after the slide's last shot, since it puts text in the page to measure.
 */
async function pageTheme(page: Page): Promise<PptxPageTheme> {
  const { colors, families } = await page.evaluate(measurePptxThemeInPage);
  await page.evaluate(pptxFontProbesInPage, true);
  const faces = await platformFaces(page, "data-dek-pptx-probe");
  await page.evaluate(pptxFontProbesInPage, false);
  const fonts: PptxPageTheme["fonts"] = {};
  for (const token of ["title", "body"] as const) {
    const family = families[token];
    const latin = faces.get(`${token}-latin`);
    if (family !== undefined && latin !== undefined) {
      fonts[token] = { family, latin, ea: faces.get(`${token}-ea`) ?? latin };
    }
  }
  return { colors, fonts };
}

/** The font Chromium drew each marked element's text with, by the element's number. */
async function platformFonts(page: Page): Promise<Map<number, string>> {
  const fonts = new Map<number, string>();
  for (const [owner, face] of await platformFaces(page, PPTX_OWNER_ATTR)) {
    if (Number.isInteger(Number(owner))) {
      fonts.set(Number(owner), face);
    }
  }
  return fonts;
}

/**
 * The font Chromium drew each element marked with `attr` in, by the attribute's value: the one
 * that drew most of its glyphs, as the DevTools protocol reports it. A theme names a stack, or
 * only `sans-serif`; this is the face that was found.
 */
async function platformFaces(page: Page, attr: string): Promise<Map<string, string>> {
  const fonts = new Map<string, string>();
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = (await cdp.send("DOM.getDocument", { depth: -1 })) as {
      root: { nodeId: number };
    };
    const { nodeIds } = (await cdp.send("DOM.querySelectorAll", {
      nodeId: root.nodeId,
      selector: `[${attr}]`,
    })) as { nodeIds: number[] };
    for (const nodeId of nodeIds) {
      const { attributes } = (await cdp.send("DOM.getAttributes", { nodeId })) as {
        attributes: string[];
      };
      const value = attributes[attributes.indexOf(attr) + 1];
      const { fonts: used } = (await cdp.send("CSS.getPlatformFontsForNode", { nodeId })) as {
        fonts: Array<{ familyName: string; glyphCount: number }>;
      };
      const main = [...used].sort((a, b) => b.glyphCount - a.glyphCount)[0];
      if (main && value !== undefined) {
        fonts.set(value, main.familyName);
      }
    }
  } finally {
    await cdp.detach();
  }
  return fonts;
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
    (page, pageReq) => visitPage(page, pageReq, request),
  );
  // Sheets come last: they tile what the pages above just wrote.
  if (request.sheets && request.sheets.length > 0) {
    await renderSheets(request.sheets, () => context.newPage());
  }
  return {
    overflows: found.flatMap((page) => page.overflows),
    contrasts: found.flatMap((page) => page.contrasts),
    drawErrors: found.flatMap((page) => page.drawErrors ?? []),
    collisions: found.flatMap((page) => page.collisions ?? []),
    fills: found.flatMap((page) => page.fills ?? []),
  };
}

/** A contrast finding below its threshold, with the key of the text it came from. */
type Failing = { finding: ContrastFinding; key: string };

/**
 * An overflow found on the page, with the index of the element that crosses the edge: the
 * frame's, or an ancestor's that cuts the element's text off.
 */
type Crossing = { finding: PagesResponse["overflows"][number]; element: number; frame: Box };

/**
 * One text the page draws: an element's own, or one a pseudo-element draws. `key` finds the same
 * text again when the page is measured a second time.
 */
type PageText = {
  key: string;
  /** For text a pseudo-element draws: its host's mark and which pseudo-element it is. */
  pseudo?: { host: string; pseudo: "before" | "after" };
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
    element.ownText && !element.decorative
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
    return rect ? [{ key, pseudo: { host, pseudo }, rects: [rect], ...text }] : [];
  });
  return [...own, ...pseudo];
}

/**
 * The texts drawn over each other. Each text in a pair the boxes suggest is looked at again as it
 * shows, drawn alone. A pseudo-element's, whose box can be far wider than its words as a
 * full-width running head's is, is looked at with the box its glyphs cover. One none of whose
 * glyphs shows was replaced when the text it crosses takes its place, as a count-up's next number
 * does, and collides with nothing; under anything else, such as a callout laid over a label, the
 * audience loses it, and it collides where it is laid out.
 */
async function textCollisions(page: Page, texts: PageText[]): Promise<Array<[PageText, PageText]>> {
  const candidates = findCollisions(texts);
  const paired = [...new Set(candidates.flat())];
  if (paired.length === 0) {
    return candidates;
  }
  const glyphs = await measureGlyphBoxes(
    page,
    paired.map(({ key, pseudo, rects }) =>
      pseudo ? { ...pseudo, rects } : { element: Number(key), rects },
    ),
  );
  const glyphOf = new Map(paired.map((text, at) => [text, glyphs[at]]));
  const drawn = (text: PageText): PageText => {
    const glyph = glyphOf.get(text);
    return glyph && text.pseudo ? { ...text, rects: [glyph] } : text;
  };
  return candidates.filter(([a, b]) =>
    !glyphOf.get(a) || !glyphOf.get(b)
      ? !samePlace(a, b)
      : findCollisions([drawn(a), drawn(b)]).length > 0,
  );
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
  { actions, viewport }: Pick<PagesRequest, "actions" | "viewport">,
): Promise<PagesResponse> {
  const response: PagesResponse = { overflows: [], contrasts: [], collisions: [], fills: [] };
  const failing: Failing[] = [];
  const crossing: Crossing[] = [];
  await page.setContent(pageReq.html, { waitUntil: "load" });
  const { slug, step } = pageReq;
  response.drawErrors = await page.evaluate(() => window.__dekDrawErrors ?? []);
  if (actions.length > 0) {
    const measured = await page.evaluate(measureSlideInPage);
    const texts = await pageTexts(page, measured);
    // The audience sees the frame: a slide its CSS makes taller or scales up is cut to it.
    const frame = measured.slideBox && {
      left: Math.max(measured.slideBox.left, 0),
      top: Math.max(measured.slideBox.top, 0),
      right: Math.min(measured.slideBox.right, viewport.width),
      bottom: Math.min(measured.slideBox.bottom, viewport.height),
    };
    if (actions.includes("fill") && frame) {
      response.fills?.push({ slug, step, ...measureFill(frame, measured.elements) });
    }
    if (actions.includes("overflow") && frame) {
      for (const { element, ...overflow } of [
        ...findOverflows(frame, measured.elements),
        ...findClippedText(measured.elements),
      ]) {
        const finding = { slug, step, ...overflow };
        response.overflows.push(finding);
        crossing.push({ finding, element, frame });
      }
      for (const [one, other] of await textCollisions(page, texts)) {
        response.collisions?.push({
          slug,
          step,
          box: one.box,
          ...(one.text ? { text: one.text } : {}),
          other: other.box,
          ...(other.text ? { otherText: other.text } : {}),
        });
      }
    }
    if (actions.includes("contrast")) {
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
  // After the shot: what follows takes the page apart, and it is not put back.
  await attributeFindings(page, { failing, crossing });
  await page.evaluate(unmarkPseudoTextsInPage);
  return response;
}

/**
 * Says what brought each finding about, by taking the page apart one layer at a time and
 * measuring again: first what the slide's script drew, then the slide's own CSS. A text that
 * clears its threshold, or an element that no longer crosses an edge, once a layer is gone is
 * that layer's to fix. With both gone, a text that still fails is the theme's, and an element that
 * still overflows is its content's: too much for the theme's sizes. The page is not put back.
 */
async function attributeFindings(
  page: Page,
  pending: { failing: Failing[]; crossing: Crossing[] },
): Promise<void> {
  let { failing, crossing } = pending;
  for (const layer of LAYERS) {
    if (failing.length === 0 && crossing.length === 0) {
      return;
    }
    if (!(await page.evaluate(layer.strip, SLIDE_CSS_ID))) {
      continue;
    }
    // Transitions and animations the change sets off would otherwise be caught midway.
    await page.evaluate(finishBeat);
    const measured = await page.evaluate(measureSlideInPage);
    crossing = crossing.filter(({ finding, element, frame }) => {
      const now = measured.elements[element];
      const still =
        now !== undefined &&
        (finding.clip === undefined ? crossesEdge(frame, now) : findClippedText([now]).length > 0);
      if (now && !still) {
        finding.origin = layer.origin;
        return false;
      }
      return true;
    });
    if (failing.length === 0) {
      continue;
    }
    const texts = await pageTexts(page, measured);
    const contrasts = await textContrasts(page, texts);
    const now = new Map(texts.map((text, at) => [text.key, { text, contrast: contrasts[at] }]));
    failing = failing.filter(({ finding, key }) => {
      const measuredText = now.get(key);
      if (
        measuredText?.contrast &&
        measuredText.contrast.ratio >= contrastThreshold(measuredText.text)
      ) {
        finding.origin = layer.origin;
        return false;
      }
      return true;
    });
  }
  for (const { finding } of failing) {
    finding.origin = "theme";
  }
  for (const { finding } of crossing) {
    finding.origin = "content";
  }
}

/**
 * What a slide adds over the theme, outermost first, each with how to take it away in the page;
 * `strip` says whether there was anything to take.
 */
const LAYERS: Array<{
  origin: Exclude<ContrastOrigin, "theme"> & OverflowOrigin;
  strip: (slideCssId: string) => boolean;
}> = [
  {
    origin: "script",
    strip: () => {
      const undo = window.__dekUndoDraw;
      undo?.();
      return undo !== undefined;
    },
  },
  {
    origin: "slide",
    strip: (id) => {
      const style = document.getElementById(id);
      style?.remove();
      return style !== null;
    },
  },
];
