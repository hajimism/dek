import { readTheme } from "./assets.ts";
import { printPageCss } from "./chrome.ts";
import { deckSlides, htmlShell, stampSlide } from "./html.ts";
import { type DistOptions, distFile } from "./path.ts";
import { type PlaywrightRunner, requirePlaywright } from "./playwright.ts";
import { asResolvedDeck, type ProjectDeck, type ResolvedDeck } from "./resolve.ts";
import { outputPath } from "./safe-fs.ts";
import { logicalSize } from "./size.ts";
import { readSlideScripts, stillPageScript } from "./slide-script.ts";
import { lastStop, stepKey, stepValuesForBeat } from "./step.ts";

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
  const outPath = distFile(project, deck, "pdf", options);
  await requirePlaywright(
    {
      kind: "pdf",
      viewport: logicalSize(deck.deck.ratio),
      html: renderPdfHtml(deck),
      // Chromium opens the path itself, so what is there must not be a link it would write through.
      pdfPath: outputPath(outPath, project.root),
    },
    options.runner,
  );
  return { outPath };
}

export function renderPdfHtml(deck: ProjectDeck): string {
  const slides = deckSlides(deck);
  // Every slide at its last beat, as a handout shows it.
  const slidesHtml = deck.deck.sections
    .map((section) => {
      const last = lastStop(section.beats);
      return stampSlide(slides.section(section.slug), {
        slug: section.slug,
        shown: stepValuesForBeat(section.beats, last),
        beat: { index: last, step: stepKey(section.beats, last) },
        inline: { deckDir: deck.dir },
      });
    })
    .join("");
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
