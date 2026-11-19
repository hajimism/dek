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

/** A picture this share of the slide or more is a picture of the slide. */
const SLIDE_SIZED = 0.9;

/** How far a layer may lie from the box the slide shows its text in, in pixels. */
const NEAR = 12;

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
    const { missing, moved } = findText(reference.outline, layers);
    if (moved.length > 0) {
      diagnostics.push({
        id: "pptx-place",
        severity: "warning",
        slug,
        message: `${moved.length} of the slide's texts are in a layer away from where the slide shows them: ${moved
          .slice(0, 3)
          .map((text) => `"${clip(text)}"`)
          .join(", ")}${moved.length > 3 ? ", …" : ""}`,
        hint: "set each in a layer over the box the outline gives it",
        data: { texts: moved },
      });
    }
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
    const covers = layers.filter(
      (layer) =>
        layer.kind === "picture" &&
        layer.width * layer.height >= SLIDE_SIZED * width * height &&
        !shownPicture(reference.outline, layer, width * height),
    );
    if (covers.length > 0) {
      diagnostics.push({
        id: PICTURE,
        severity: "warning",
        slug,
        message: `a picture covers the slide (${covers.map((layer) => (layer.kind === "picture" ? layer.file : "")).join(", ")})`,
        hint: "set it as the slide's backdrop if it is decoration, or draw what it shows as shapes",
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

type Box = { x: number; y: number; width: number; height: number };

const overlaps = (a: Box, b: Box, margin: number): boolean =>
  a.x < b.x + b.width + margin &&
  b.x < a.x + a.width + margin &&
  a.y < b.y + b.height + margin &&
  b.y < a.y + a.height + margin;

/** Whether every character of `ink` is among those of `held`, as often as `ink` has it. */
function holds(held: string, ink: string): boolean {
  const left = new Map<string, number>();
  for (const char of held) {
    left.set(char, (left.get(char) ?? 0) + 1);
  }
  for (const char of ink) {
    const count = left.get(char) ?? 0;
    if (count === 0) {
      return false;
    }
    left.set(char, count - 1);
  }
  return true;
}

/**
 * The texts the slide shows that no layer holds, and those a layer holds away from where the
 * slide shows them. A text is found when the layers over its box hold its characters, however
 * they are split across boxes and runs; the characters of one text never count for another's.
 */
function findText(
  outline: PptxSpecNode | undefined,
  layers: PptxJsonLayer[],
): { missing: string[]; moved: string[] } {
  const inked = layers
    .map((layer) => ({ box: boxOf(layer), ink: inkOf(layer) }))
    .filter((each) => each.ink !== "");
  const all = inked.map((each) => each.ink).join("");
  const missing: string[] = [];
  const moved: string[] = [];
  const visit = (node: PptxSpecNode) => {
    if (node.decoration) {
      return;
    }
    const shown = [node.before, node.text?.content, node.after]
      .filter((each): each is string => Boolean(each))
      .join("");
    const ink = shown.replace(/\s+/g, "");
    if (ink !== "") {
      const near = inked
        .filter((each) => overlaps(each.box, node, NEAR))
        .map((each) => each.ink)
        .join("");
      if (!holds(near, ink)) {
        (holds(all, ink) ? moved : missing).push(shown.trim());
      }
    }
    node.children?.forEach(visit);
  };
  if (outline) {
    visit(outline);
  }
  return { missing, moved };
}

/** Whether the slide shows a picture as large as `layer` where it lies: a photo, not the slide. */
function shownPicture(outline: PptxSpecNode | undefined, layer: Box, area: number): boolean {
  const found = (node: PptxSpecNode): boolean =>
    ((node.picture === "image" || node.picture === "canvas" || node.picture === "video") &&
      node.width * node.height >= SLIDE_SIZED * area &&
      overlaps(node, layer, 0)) ||
    (node.children ?? []).some(found);
  return outline !== undefined && found(outline);
}

function clip(text: string): string {
  const line = text.replace(/\s+/g, " ");
  return line.length > 40 ? `${line.slice(0, 39)}…` : line;
}
