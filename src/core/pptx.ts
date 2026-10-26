import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DistOptions, distFile } from "./path.ts";
import { type PlaywrightRunner, requirePlaywright } from "./playwright.ts";
import { mapPictures, type PptxLayer, pptxPackage } from "./pptx-package.ts";
import { presenterSlides } from "./presenter.ts";
import { asResolvedDeck, type ResolvedDeck } from "./resolve.ts";
import { writeInside } from "./safe-fs.ts";
import { logicalSize } from "./size.ts";
import { lastStop } from "./step.ts";
import { loadSlideSources, renderSlideHtml } from "./still-page.ts";

export type PptxResult = {
  outPath: string;
  /**
   * With `shapes`, what was laid over the pictures: how many shapes, lines included, and
   * pictures, and the slugs of the slides that kept everything in their picture.
   */
  lifted?: PptxLifted;
};

export type PptxLifted = { shapes: number; pictures: number; untouched: string[] };

export type PptxOptions = DistOptions & {
  /** For anyone who has the file: the notes leave out the stage directions and comments. */
  public?: boolean;
  /** Lay boxes, pictures, and the text in them over the picture as PowerPoint's own (ADR 20). */
  shapes?: boolean;
  runner?: PlaywrightRunner;
};

/**
 * The deck as a PowerPoint file: each slide at its last beat, as the PDF prints it, drawn as a
 * picture with its text laid over it in text boxes a recipient can edit, and with `shapes` its
 * boxes and pictures as shapes and pictures of their own; its script in the notes. A slide
 * script that cannot run stops it, as it stops the PDF.
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
        shapes: options.shapes ?? false,
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
        layers: mapPictures(slide.layers, ({ png, svg, ...picture }) => ({
          ...picture,
          png: readFileSync(png),
          ...(svg === undefined ? {} : { svg }),
        })),
        notes: scripts[index]?.script ?? "",
      })),
    });
    writeInside(outPath, bytes, project.root);
    if (!options.shapes) {
      return { outPath };
    }
    const lifted: PptxLifted = { shapes: 0, pictures: 0, untouched: [] };
    for (const slide of answer.slides) {
      const counts = countLifted(slide.layers);
      lifted.shapes += counts.shapes;
      lifted.pictures += counts.pictures;
      if (counts.shapes + counts.pictures === 0) {
        lifted.untouched.push(slide.slug);
      }
    }
    return { outPath, lifted };
  } finally {
    rmSync(shots, { recursive: true, force: true });
  }
}

function countLifted<I>(layers: PptxLayer<I>[]): { shapes: number; pictures: number } {
  let shapes = 0;
  let pictures = 0;
  for (const layer of layers) {
    if (layer.kind === "shape") {
      const inner = countLifted(layer.layers);
      shapes += 1 + inner.shapes;
      pictures += inner.pictures;
    } else if (layer.kind === "rule") {
      shapes += 1;
    } else if (layer.kind === "picture") {
      pictures += 1;
    }
  }
  return { shapes, pictures };
}
