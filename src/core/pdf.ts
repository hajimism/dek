import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { collectPrintSlidesHtml, htmlShell, readTheme } from "./html.ts";
import { type DistOptions, distFile } from "./path.ts";
import {
  defaultPlaywrightRunner,
  type PlaywrightRunner,
  playwrightMissingError,
} from "./playwright.ts";
import { asResolvedDeck, type ProjectDeck, type ResolvedDeck } from "./resolve.ts";
import { logicalSize } from "./size.ts";

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
  mkdirSync(dirname(outPath), { recursive: true });

  const size = logicalSize(deck.deck.ratio);
  const response = await runner({
    viewport: size,
    actions: ["pdf"],
    pages: [{ html: renderPdfHtml(deck) }],
    pdfPath: outPath,
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
  <style>${printCss(size)}</style>`,
    body: `<div id="deck">${slidesHtml}</div>`,
  });
}

function printCss(size: { width: number; height: number }): string {
  return `@page { size: ${size.width}px ${size.height}px; margin: 0 }
html, body, #deck { width: ${size.width}px; background: #000 }
#deck { height: auto }
#deck > .slide { display: block; width: ${size.width}px; height: ${size.height}px; break-after: page }`;
}
