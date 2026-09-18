import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DekError } from "./error.ts";
import { escapeHtml } from "./escape.ts";
import { collectPrintSlidesHtml, readTheme } from "./html.ts";
import { defaultPlaywrightRunner, type PlaywrightRunner } from "./playwright.ts";
import { asResolvedDeck, type ProjectDeck, type ResolvedDeck } from "./resolve.ts";
import { logicalSize } from "./size.ts";

export type PdfResult = {
  outPath: string;
};

export async function pdfDeck(
  dir: string,
  options?: { runner?: PlaywrightRunner },
): Promise<PdfResult>;
export async function pdfDeck(
  source: ResolvedDeck,
  options?: { runner?: PlaywrightRunner },
): Promise<PdfResult>;
export async function pdfDeck(
  input: string | ResolvedDeck,
  options: { runner?: PlaywrightRunner } = {},
): Promise<PdfResult> {
  const { project, deck } = asResolvedDeck(input);
  const runner = options.runner ?? defaultPlaywrightRunner;
  const outPath = join(project.root, "dist", `${deck.name}.pdf`);
  mkdirSync(dirname(outPath), { recursive: true });

  const size = logicalSize(deck.deck.ratio);
  const response = await runner({
    viewport: size,
    actions: ["pdf"],
    pages: [{ html: renderPdfHtml(deck) }],
    pdfPath: outPath,
  });
  if (response === null) {
    throw new DekError("Playwright is not installed", { hint: "bunx playwright install" });
  }
  return { outPath: response.pdfPath ?? outPath };
}

export function renderPdfHtml(deck: ProjectDeck): string {
  const slidesHtml = collectPrintSlidesHtml(deck);
  const themeCss = readTheme(deck.dir, true);
  const size = logicalSize(deck.deck.ratio);
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(deck.deck.title)}</title>
  <style>${themeCss}</style>
  <style>${printCss(size)}</style>
</head>
<body>
  <div id="deck">${slidesHtml}</div>
</body>
</html>
`;
}

function printCss(size: { width: number; height: number }): string {
  return `@page { size: ${size.width}px ${size.height}px; margin: 0 }
html, body, #deck { width: ${size.width}px; background: #000 }
#deck { height: auto }
#deck > .slide { display: block; width: ${size.width}px; height: ${size.height}px; break-after: page }`;
}
