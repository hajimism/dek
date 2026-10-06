import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DistOptions, distFile } from "./path.ts";
import { type PlaywrightRunner, requirePlaywright } from "./playwright.ts";
import { pptxPackage } from "./pptx-package.ts";
import { presenterSlides } from "./presenter.ts";
import { asResolvedDeck, type ResolvedDeck } from "./resolve.ts";
import { writeInside } from "./safe-fs.ts";
import { logicalSize } from "./size.ts";
import { lastStop } from "./step.ts";
import { loadSlideSources, renderSlideHtml } from "./still-page.ts";

export type PptxResult = { outPath: string };

export type PptxOptions = DistOptions & {
  /** For anyone who has the file: the notes leave out the stage directions and comments. */
  public?: boolean;
  runner?: PlaywrightRunner;
};

/**
 * The deck as a PowerPoint file: each slide at its last beat, as the PDF prints it, drawn as a
 * picture with its text laid over it in text boxes a recipient can edit, and its script in the
 * notes. A slide script that cannot run stops it, as it stops the PDF.
 */
export async function pptxDeck(dir: string, options?: PptxOptions): Promise<PptxResult>;
export async function pptxDeck(source: ResolvedDeck, options?: PptxOptions): Promise<PptxResult>;
export async function pptxDeck(
  input: string | ResolvedDeck,
  options: PptxOptions = {},
): Promise<PptxResult> {
  const { project, deck } = asResolvedDeck(input);
  const outPath = distFile(project, deck, "pptx", options);
  const size = logicalSize(deck.deck.ratio);
  const sources = loadSlideSources(deck, { strict: true });
  const { sections } = deck.deck;
  // Rendered before Chromium starts, so a slide that cannot be drawn stops it with nothing written.
  const pages = sections.map((section, index) => ({
    html: renderSlideHtml(sources, section.slug, lastStop(section.beats)),
    slug: section.slug,
    index,
  }));
  const shots = mkdtempSync(join(tmpdir(), "dek-pptx-"));
  try {
    const answer = await requirePlaywright(
      {
        kind: "pptx",
        viewport: size,
        pages: pages.map(({ html, slug, index }) => ({
          html,
          slug,
          screenshotPath: join(shots, `${index + 1}.png`),
        })),
      },
      options.runner,
    );
    const scripts = presenterSlides(deck, options.public ? "audience" : "speaker");
    const bytes = pptxPackage({
      title: deck.deck.title,
      lang: deck.deck.lang,
      size,
      slides: answer.slides.map((slide, index) => ({
        picture: readFileSync(join(shots, `${index + 1}.png`)),
        description: slide.description || (sections[index]?.title ?? slide.slug),
        texts: slide.boxes,
        notes: scripts[index]?.script ?? "",
      })),
    });
    writeInside(outPath, bytes, project.root);
  } finally {
    rmSync(shots, { recursive: true, force: true });
  }
  return { outPath };
}
