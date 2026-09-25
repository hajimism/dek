import { printPageCss } from "./chrome.ts";
import { collectPrintSlidesHtml, htmlShell, readTheme } from "./html.ts";
import { type DistOptions, distFile } from "./path.ts";
import {
  defaultPlaywrightRunner,
  type PlaywrightRunner,
  playwrightMissingError,
} from "./playwright.ts";
import { asResolvedDeck, type ProjectDeck, type ResolvedDeck } from "./resolve.ts";
import { outputPath } from "./safe-fs.ts";
import { logicalSize } from "./size.ts";
import { readSlideScripts, stillPageScript } from "./slide-script.ts";

export type PdfResult = {
  outPath: string;
};

export type PdfOptions = DistOptions & {
  runner?: PlaywrightRunner;
};

export async function pdfDeck(dir: string, options?: PdfOptions): Promise<PdfResult>;
export async function pdfDeck(source: ResolvedDeck, options?: PdfOptions): Promise<PdfResult>;
export async function pdfDeck(
  input: string | ResolvedDeck,
  options: PdfOptions = {},
): Promise<PdfResult> {
  const { project, deck } = asResolvedDeck(input);
  const runner = options.runner ?? defaultPlaywrightRunner;
  const outPath = distFile(project, deck, "pdf", options);

  const size = logicalSize(deck.deck.ratio);
  const response = await runner({
    viewport: size,
    actions: ["pdf"],
    pages: [{ html: renderPdfHtml(deck) }],
    // Chromium opens the path itself, so what is there must not be a link it would write through.
    pdfPath: outputPath(outPath, project.root),
  });
  if (response === null) {
    throw playwrightMissingError();
  }
  return { outPath: response.pdfPath ?? outPath };
}

export function renderPdfHtml(deck: ProjectDeck): string {
  const slidesHtml = collectPrintSlidesHtml(deck);
  const themeCss = readTheme(deck.dir, true);
  const size = logicalSize(deck.deck.ratio);
  return htmlShell({
    lang: deck.deck.lang,
    title: deck.deck.title,
    head: `<style>${themeCss}</style>
  <style>${printPageCss(size)}</style>`,
    body: `<div id="deck">${slidesHtml}</div>
  ${stillPageScript(readSlideScripts(deck.dir, { strict: true }))}`,
  });
}
