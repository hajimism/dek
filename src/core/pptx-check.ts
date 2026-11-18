import type { Diagnostic } from "./diagnostic.ts";
import type { PptxJson, PptxJsonLayer } from "./pptx-json.ts";
import type { PptxSpec, PptxSpecNode } from "./pptx-spec.ts";

// What `dekc pptx --from` says of a PPTX an agent built again, against what the deck showed:
// each finding on its slide, with what to do next. Errors are what a recipient would miss: a
// slide, its text, its title in PowerPoint's outline, or a layer they cannot see. Warnings are
// what keeps the file from being one they edit as their own: the slide's picture of the rest,
// and text set a line a box.

/** A slide that keeps a picture of the rest of itself, which the rebuild is for. */
const PICTURE = "pptx-picture";

/** How much of the slide a layer may pass its edge by, in pixels, as a shadow or a bleed. */
const BLEED = 2;

export function checkPptxJson(json: PptxJson, spec: PptxSpec): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const want = spec.slides.map((slide) => slide.slug);
  const have = json.slides.map((slide) => slide.slug);
  if (want.join("\n") !== have.join("\n")) {
    const missing = want.filter((slug) => !have.includes(slug));
    const extra = have.filter((slug) => !want.includes(slug));
    diagnostics.push({
      id: "pptx-slides",
      severity: "error",
      message:
        missing.length + extra.length > 0
          ? `the file's slides are not the deck's: ${[
              ...(missing.length > 0 ? [`missing ${missing.join(", ")}`] : []),
              ...(extra.length > 0 ? [`not in the deck ${extra.join(", ")}`] : []),
            ].join("; ")}`
          : "the file's slides are the deck's in another order",
      hint: "keep one slide per section of script.md, in its order, each with its section's id as slug",
      data: { want, have },
    });
  }
  const { width, height } = json.size;
  for (const slide of json.slides) {
    const reference = spec.slides.find((each) => each.slug === slide.slug);
    if (!reference) {
      continue;
    }
    const { slug } = slide;
    const layers = flatten(slide.layers);
    if (!layers.some((layer) => layer.kind === "prose" && layer.title === true)) {
      diagnostics.push({
        id: "pptx-title",
        severity: "error",
        slug,
        message: `no layer is the slide's title "${reference.title}"`,
        hint: 'set the heading as a prose layer with "title": true, outside any shape',
      });
    }
    const missing = lostText(reference.outline, layers);
    if (missing.length > 0) {
      diagnostics.push({
        id: "pptx-text",
        severity: "error",
        slug,
        message: `${missing.length} of the slide's texts are in no layer: ${missing
          .slice(0, 3)
          .map((text) => `"${clip(text)}"`)
          .join(", ")}${missing.length > 3 ? ", …" : ""}`,
        hint: "set each as text in a prose, text, or shape layer, as it reads on the slide",
        data: { missing },
      });
    }
    const off = layers.filter((layer) => {
      const box = boxOf(layer);
      return (
        box.x < -BLEED ||
        box.y < -BLEED ||
        box.x + box.width > width + BLEED ||
        box.y + box.height > height + BLEED
      );
    });
    if (off.length > 0) {
      diagnostics.push({
        id: "pptx-bounds",
        severity: "error",
        slug,
        message: `${off.length} layer${off.length === 1 ? " lies" : "s lie"} past the slide's edge (${width}×${height})`,
        hint: "move or shrink each into the slide",
        data: { boxes: off.map((layer) => boxOf(layer)) },
      });
    }
    if (slide.picture) {
      diagnostics.push({
        id: PICTURE,
        severity: "warning",
        slug,
        message: `the slide keeps a picture of everything not laid over it (${slide.picture})`,
        hint: "draw what is left as shapes, or lay its parts from spec.json as pictures, and drop picture",
      });
    }
    const lines = layers.filter((layer) => layer.kind === "text").length;
    if (lines > 0) {
      diagnostics.push({
        id: "pptx-lines",
        severity: "warning",
        slug,
        message: `${lines} text layer${lines === 1 ? " sets" : "s set"} a line a box`,
        hint: "set each block as one prose layer that PowerPoint wraps",
        data: { lines },
      });
    }
    if (!slide.notes?.trim() && reference.notes.trim()) {
      diagnostics.push({
        id: "pptx-notes",
        severity: "warning",
        slug,
        message: "the slide's notes are empty though the script speaks to it",
        hint: "set notes to the slide's notes in spec.json",
      });
    }
  }
  return diagnostics;
}

/** Every layer, those in shapes included. */
function flatten(layers: PptxJsonLayer[]): PptxJsonLayer[] {
  return layers.flatMap((layer) =>
    layer.kind === "shape" ? [layer, ...flatten(layer.layers ?? [])] : [layer],
  );
}

function boxOf(layer: PptxJsonLayer): { x: number; y: number; width: number; height: number } {
  if (layer.kind === "rule") {
    return {
      x: Math.min(layer.x1, layer.x2),
      y: Math.min(layer.y1, layer.y2),
      width: Math.abs(layer.x2 - layer.x1),
      height: Math.abs(layer.y2 - layer.y1),
    };
  }
  return { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
}

/** What a layer says, without white space. */
function inkOf(layer: PptxJsonLayer): string {
  const runs =
    layer.kind === "text"
      ? layer.runs
      : layer.kind === "prose"
        ? layer.text.paragraphs.flatMap((paragraph) => paragraph.runs)
        : layer.kind === "shape" && layer.text
          ? layer.text.paragraphs.flatMap((paragraph) => paragraph.runs)
          : [];
  return runs
    .map((run) => run.text)
    .join("")
    .replace(/\s+/g, "");
}

/**
 * The texts the slide shows that the layers do not hold: each block's characters taken, in
 * order, from those the layers hold, so a block split across boxes or runs is still found.
 */
function lostText(outline: PptxSpecNode | undefined, layers: PptxJsonLayer[]): string[] {
  const held = new Map<string, number>();
  for (const char of layers.map(inkOf).join("")) {
    held.set(char, (held.get(char) ?? 0) + 1);
  }
  const lost: string[] = [];
  const visit = (node: PptxSpecNode) => {
    if (node.decoration) {
      return;
    }
    const shown = [node.before, node.text?.content, node.after]
      .filter((each): each is string => Boolean(each))
      .join("");
    const ink = shown.replace(/\s+/g, "");
    let short = false;
    for (const char of ink) {
      const left = held.get(char) ?? 0;
      if (left > 0) {
        held.set(char, left - 1);
      } else {
        short = true;
      }
    }
    if (short) {
      lost.push(shown.trim());
    }
    node.children?.forEach(visit);
  };
  if (outline) {
    visit(outline);
  }
  return lost;
}

function clip(text: string): string {
  const line = text.replace(/\s+/g, " ");
  return line.length > 40 ? `${line.slice(0, 39)}…` : line;
}
