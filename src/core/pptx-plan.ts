import type {
  PptxFill,
  PptxLayer,
  PptxPaint,
  PptxParagraph,
  PptxPicture,
  PptxRule,
  PptxRun,
  PptxShape,
  PptxShapeText,
  PptxTextBox,
  PptxTextLayer,
} from "./pptx-package.ts";
import type { PptxPagePaint } from "./pptx-paint.ts";
import type { PptxPageTexts } from "./pptx-text.ts";
import { slideBackground } from "./pptx-theme.ts";
import type { Box } from "./slide-measure.ts";

// What a PPTX lays over a slide's picture, decided from what the page measured: with `--shapes`,
// which boxes and pictures become PowerPoint's own, what they are grouped with, and which text
// becomes a shape's paragraphs; without it, the text alone, line by line. Nothing here touches a
// page, so every rule ADR 20 writes down is checked without a browser.

/**
 * A place in the order the browser paints: a `[layer, index]` pair for each element from the
 * slide down, the layer negative for a negative `z-index`, 0 in the flow, 1 positioned or a
 * stacking context of its own, more for a positive `z-index`, and the index the element's place
 * in the document. What an element holds has a longer key than the element, and paints after it.
 */
export type PaintKey = number[];

/** An element of the slide, the slide itself left out. */
export type PptxPaintNode = {
  /** The nearest element above it, or -1 for the slide. */
  parent: number;
  key: PaintKey;
  /** Its border box on the slide. */
  rect: Box;
  /** What it draws of its own, if anything. */
  paint?: PptxNodePaint;
  /**
   * How it paints among the blocks of its stacking context (CSS 2, Appendix E): a float after
   * their backgrounds; inline-level content, an inline block, or a flex or grid item after the
   * floats too, with the text; a block, unset, in its place among the blocks.
   */
  flow?: "float" | "inline";
};

type PptxSide = { width: number; paint: PptxPaint };

/** A box PowerPoint can draw as a shape: a color, solid borders, and round corners at most. */
type PptxBoxPaint = {
  kind: "shape";
  /** Its content box, inside its borders and padding. */
  content: Box;
  fill?: PptxPaint;
  /** A border the same on every side. */
  outline?: PptxSide;
  /** Borders that differ per side, with square corners. */
  sides?: Partial<Record<"top" | "right" | "bottom" | "left", PptxSide>>;
  radius: number;
};

export type PptxNodePaint =
  | PptxBoxPaint
  /** A picture drawn alone: its border box, or as far as its own shadow and outline reach. */
  | { kind: "picture"; description: string; extent?: Box }
  /** Paint that stays in the picture, as far as it reaches, shadows included. */
  | { kind: "drawn"; extent: Box };

/**
 * What else stays in the picture: what a pseudo-element or a list marker draws, a text the
 * picture keeps, or a text's shadow. It is painted as part of the element `within`, at `key`.
 */
type PptxDrawn = { within: number; key: PaintKey; extent: Box };

/** A list item's marker that PowerPoint has a bullet for. */
type PptxMarker = {
  node: number;
  key: PaintKey;
  extent: Box;
  bullet: { char: string } | { ordinal: number };
};

/** A run as the page measures it: the element whose text it is, for its font and its place. */
export type PptxMeasuredRun = PptxRun & { owner: number };

/** A line of text, or the part of one that sits together, in the block that sets it. */
export type PptxMeasuredBox = Omit<PptxTextBox, "runs"> & {
  block: number;
  runs: PptxMeasuredRun[];
};

/** A block's text as it is written: its runs in order, a `<br>` as `\n`, and how it is set. */
export type PptxBlockText = {
  node: number;
  runs: PptxMeasuredRun[];
  align: PptxParagraph["align"];
  /** Its line height in pixels; not a number when it is `normal`. */
  lineHeight: number;
  content: Box;
  textIndent: number;
};

/** Everything the page measured of a slide that the plan decides from. */
export type PptxPageFacts = {
  nodes: PptxPaintNode[];
  drawn: PptxDrawn[];
  markers: PptxMarker[];
  boxes: PptxMeasuredBox[];
  /** Each block whose text a box carries; only a block that reads as plain lines is here. */
  blocks: PptxBlockText[];
  /** What the slide's pictures say they show, and the element that says it. */
  described: Array<{ node: number; text: string }>;
  /**
   * The slide's background, when PowerPoint can paint it as the browser did, and whether the
   * slide is a stacking context, so nothing a negative `z-index` puts beneath it is hidden by it.
   */
  slide?: { background?: PptxFill; stacking: boolean };
};

/** A picture as the plan has it: the element to draw alone. */
type PlannedImage = { node: number };

export type PptxPlan = {
  layers: PptxLayer<PlannedImage>[];
  /** The elements laid over the picture, to be taken out of it. */
  lifted: { shapes: number[]; pictures: number[]; markers: number[] };
  /** What the slide's picture shows, without what was laid over it. */
  description: string;
  /** The slide's background, taken out of its picture to be PowerPoint's. */
  background?: PptxFill;
};

/**
 * The facts a plan is made from, out of what the page measured and where Chromium says each
 * pseudo-element and marker lies, keyed `<host>::<pseudo>` in the viewport. One it does not
 * place is taken to draw anywhere in its element, or anywhere at all for the slide's, so
 * nothing is laid over what it might draw.
 */
export function pptxPageFacts(
  paint: PptxPagePaint,
  texts: PptxPageTexts,
  placed: ReadonlyMap<string, Box>,
): PptxPageFacts {
  const keyOf = (node: number) => paint.nodes[node]?.key ?? [];
  const drawn: PptxDrawn[] = texts.drawn.map(({ node, extent }) => ({
    within: node,
    key: textKey(keyOf(node)),
    extent,
  }));
  const markers: PptxMarker[] = [];
  for (const pseudo of paint.pseudos) {
    const box = placed.get(`${pseudo.host}::${pseudo.pseudo}`);
    if (!box) {
      const host = paint.nodes[pseudo.host]?.rect;
      const everywhere = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
      drawn.push({
        within: pseudo.host,
        key: pseudo.key,
        extent: host ? grown(host, pseudo.reach) : everywhere,
      });
      continue;
    }
    const extent = grown(
      {
        left: box.left - paint.origin.left,
        top: box.top - paint.origin.top,
        right: box.right - paint.origin.left,
        bottom: box.bottom - paint.origin.top,
      },
      pseudo.reach,
    );
    if (pseudo.bullet) {
      markers.push({ node: pseudo.host, key: pseudo.key, extent, bullet: pseudo.bullet });
    } else {
      drawn.push({ within: pseudo.host, key: pseudo.key, extent });
    }
  }
  const { slide } = paint;
  const background =
    slide?.plain === true
      ? slideBackground(slide, { width: slide.width, height: slide.height })
      : undefined;
  return {
    nodes: paint.nodes,
    drawn,
    markers,
    boxes: texts.boxes,
    blocks: texts.blocks,
    described: paint.described,
    ...(slide
      ? { slide: { ...(background ? { background } : {}), stacking: slide.stacking } }
      : {}),
  };
}

function grown(box: Box, by: number): Box {
  return { left: box.left - by, top: box.top - by, right: box.right + by, bottom: box.bottom + by };
}

/** Where an element's text paints: after its own paint, before the elements it holds. */
function textKey(key: PaintKey): PaintKey {
  return [...key, 0, (key.at(-1) ?? -1) + 0.5];
}

/** How far apart, in pixels, two edges may be and still be one. */
const NEAR = 1;

export function planPptxLayers(page: PptxPageFacts, options: { shapes: boolean }): PptxPlan {
  if (!options.shapes) {
    return {
      layers: page.boxes.map(textLayer),
      lifted: { shapes: [], pictures: [], markers: [] },
      description: page.described.map((said) => said.text).join(" / "),
    };
  }
  const tree = new Tree(page.nodes);
  const blocks = new Map(page.blocks.map((block) => [block.node, block]));
  const candidates = page.nodes.flatMap((node, id) =>
    node.paint?.kind === "shape" || node.paint?.kind === "picture" ? [id] : [],
  );
  // What a negative `z-index` puts under its stacking context's own paint is laid out of reach
  // of the order the keys know, which cannot say whether an element is that context: it stays.
  const behind = (id: number) => tree.key(id).some((layer, at) => at % 2 === 0 && layer < 0);
  const drawn: Blocker[] = [
    ...page.drawn,
    ...page.nodes.flatMap((node, id): Blocker[] =>
      node.paint?.kind === "drawn" ? [{ self: id, key: node.key, extent: node.paint.extent }] : [],
    ),
  ];

  // Keeping one box or picture in the picture can keep another, and so can laying two over it
  // in an order the browser may not have painted them in, so this runs until nothing changes.
  // It only ever keeps more, so it ends.
  const lifted = new Set(candidates.filter((id) => !behind(id)));
  let state = settle(page, tree, blocks, lifted);
  for (;;) {
    const blockers = [
      ...drawn,
      ...candidates
        .filter((id) => !lifted.has(id))
        .map((id): Blocker => ({ self: id, key: tree.key(id), extent: tree.extent(id) })),
      ...page.markers
        .filter((marker) => !state.markers.has(marker.node))
        .map(
          (marker): Blocker => ({ within: marker.node, key: marker.key, extent: marker.extent }),
        ),
    ];
    const covered = [...lifted].filter((id) =>
      blockers.some((blocker) => covers(blocker, id, tree)),
    );
    const kept =
      covered.length > 0 ? covered : misordered(assemble(page, tree, lifted, state), tree);
    if (kept.length === 0) {
      break;
    }
    for (const id of kept) {
      lifted.delete(id);
    }
    state = settle(page, tree, blocks, lifted);
  }

  const sorted = [...lifted].sort((a, b) => a - b);
  const pictures = sorted.filter((id) => page.nodes[id]?.paint?.kind === "picture");
  // The slide's background paints first, unless the slide is no stacking context and something
  // a negative z-index puts in it paints before that, under the background, out of sight.
  const beneath = [
    ...page.nodes.map((node) => node.key),
    ...page.drawn.map((each) => each.key),
    ...page.markers.map((marker) => marker.key),
  ].some((key) => (key[0] ?? 0) < 0);
  const background =
    page.slide?.background && (page.slide.stacking || !beneath) ? page.slide.background : undefined;
  return {
    ...(background ? { background } : {}),
    layers: assemble(page, tree, lifted, state).map(({ layer }) => layer),
    lifted: {
      shapes: sorted.filter((id) => page.nodes[id]?.paint?.kind === "shape"),
      pictures,
      markers: [...state.markers].sort((a, b) => a - b),
    },
    description: page.described
      .filter((said) => !pictures.includes(said.node))
      .map((said) => said.text)
      .join(" / "),
  };
}

/**
 * Something that stays drawn: an element's own paint (`self`), or paint that is part of an
 * element (`within`), such as its pseudo-element's, its marker's, or its text's.
 */
type Blocker = ({ self: number } | { within: number }) & { key: PaintKey; extent: Box };

/**
 * Whether what stays drawn would be covered by the box or picture `id` laid over the picture:
 * it overlaps it and is inside it, or is painted after it, or might be. An element's own paint
 * is under everything it holds.
 */
function covers(blocker: Blocker, id: number, tree: Tree): boolean {
  if (!overlaps(blocker.extent, tree.extent(id))) {
    return false;
  }
  const at = "self" in blocker ? blocker.self : blocker.within;
  if ("self" in blocker ? tree.inside(at, id) && at !== id : tree.inside(at, id)) {
    return true;
  }
  return !surelyBefore(blocker.key, tree.key(id), tree);
}

/**
 * The lifted boxes and pictures laid over another in an order the browser may not have painted
 * them in, with what they overlap: of two that overlap, the one written later is kept in the
 * picture, under both, unless it is text, which is always laid over; then the one written first.
 */
function misordered(written: Placed[], tree: Tree): number[] {
  const items = written.flatMap(function flat(placed): Item[] {
    return [placed.item, ...placed.inner.flatMap(flat)];
  });
  const kept = new Set<number>();
  items.forEach((later, at) => {
    for (const earlier of items.slice(0, at)) {
      if (
        overlaps(earlier.extent, later.extent) &&
        !surelyBefore(earlier.key, later.key, tree) &&
        !kept.has(earlier.node ?? -1) &&
        !kept.has(later.node ?? -1)
      ) {
        const keep = later.node ?? earlier.node;
        if (keep !== undefined) {
          kept.add(keep);
        }
      }
    }
  });
  return [...kept];
}

/**
 * Whether `a` is surely painted before `b`. Where their keys part, each paints in the stacking
 * context they share at the layer of the first element from there that is positioned or a
 * context of its own, an element in the flow being neither: by that layer, then as the flow
 * paints, then in the document's order. A key with another such element further in may paint
 * elsewhere; then `a` comes first only where they part, with the rest of `a` in the flow or
 * under it and the rest of `b` in the flow or over it.
 */
function surelyBefore(a: PaintKey, b: PaintKey, tree: Tree): boolean {
  let at = 0;
  while (at < a.length && at < b.length && a[at] === b[at] && a[at + 1] === b[at + 1]) {
    at += 2;
  }
  if (at >= a.length) {
    return at < b.length;
  }
  if (at >= b.length) {
    return false;
  }
  const layerA = sharedLayer(a, at);
  const layerB = sharedLayer(b, at);
  if (layerA !== undefined && layerB !== undefined) {
    return partedBefore(a, b, at, tree) < 0;
  }
  const restA = a.filter((_, index) => index >= at && index % 2 === 0).every((layer) => layer <= 0);
  const restB = b.filter((_, index) => index >= at && index % 2 === 0).every((layer) => layer >= 0);
  const [indexA = 0, indexB = 0] = [a[at + 1], b[at + 1]];
  const first =
    (a[at] ?? 0) < (b[at] ?? 0) ||
    (a[at] === b[at] && (a[at] !== 0 || tree.phase(a, at) <= tree.phase(b, at)) && indexA < indexB);
  return first && restA && restB;
}

/**
 * The layer a key paints at in the stacking context where it parts from another, at `at`: its
 * first layer from there that is not the flow's, or the flow's; none when a later one is not
 * the flow's either, which might paint in another context.
 */
function sharedLayer(key: PaintKey, at: number): number | undefined {
  const layers = key.filter((_, index) => index >= at && index % 2 === 0);
  const [first = 0, ...rest] = layers.filter((layer) => layer !== 0);
  return rest.length === 0 ? first : undefined;
}

/**
 * The order the browser paints in, as far as the keys say: where they part, by the layer each
 * paints at there; in the flow, then by when each paints among the blocks there; and then by
 * place in the document.
 */
function comparePaint(a: PaintKey, b: PaintKey, tree: Tree): number {
  for (let at = 0; at < Math.min(a.length, b.length); at += 2) {
    if (a[at] !== b[at] || a[at + 1] !== b[at + 1]) {
      return partedBefore(a, b, at, tree);
    }
  }
  return a.length - b.length;
}

function partedBefore(a: PaintKey, b: PaintKey, at: number, tree: Tree): number {
  const layerA = sharedLayer(a, at) ?? a[at] ?? 0;
  const layerB = sharedLayer(b, at) ?? b[at] ?? 0;
  if (layerA !== layerB) {
    return layerA - layerB;
  }
  const phase = layerA === 0 ? tree.phase(a, at) - tree.phase(b, at) : 0;
  return phase !== 0 ? phase : (a[at + 1] ?? 0) - (b[at + 1] ?? 0);
}

/** The elements, with what is above and inside each. */
class Tree {
  constructor(private readonly nodes: PptxPaintNode[]) {}

  key(id: number): PaintKey {
    return this.nodes[id]?.key ?? [];
  }

  rect(id: number): Box {
    return this.nodes[id]?.rect ?? { left: 0, top: 0, right: 0, bottom: 0 };
  }

  /** What the element covers once laid over: its box, or a picture's whole drawing. */
  extent(id: number): Box {
    const paint = this.nodes[id]?.paint;
    return (paint?.kind === "picture" ? paint.extent : undefined) ?? this.rect(id);
  }

  parent(id: number): number {
    return this.nodes[id]?.parent ?? -1;
  }

  /**
   * When what `key` stands for paints among the blocks of the stacking context where the key
   * parts from another's, at `at` (CSS 2, Appendix E): 0 with the blocks' backgrounds, 1 with
   * the floats, 2 with the inline content, as the latest of the elements it is in from there
   * says. Text, a marker, and what a pseudo-element draws paint with the inline content.
   */
  phase(key: PaintKey, at: number): number {
    let phase = 0;
    for (let index = at + 1; index < key.length; index += 2) {
      const id = key[index] ?? 0;
      const flow = Number.isInteger(id) ? this.nodes[id]?.flow : "inline";
      phase = Math.max(phase, flow === "inline" ? 2 : flow === "float" ? 1 : 0);
    }
    return phase;
  }

  /** Whether `id` is `outer` or inside it; everything is inside the slide, -1. */
  inside(id: number, outer: number): boolean {
    for (let at = id; at !== -1; at = this.parent(at)) {
      if (at === outer) {
        return true;
      }
    }
    return outer === -1;
  }

  /** The nearest shape among `shapes` that is `id` or holds it, or -1. */
  shapeOf(id: number, shapes: ReadonlySet<number>): number {
    for (let at = id; at !== -1; at = this.parent(at)) {
      if (shapes.has(at)) {
        return at;
      }
    }
    return -1;
  }
}

/** What follows from which boxes are lifted: whose text each line is, and which reads as a column. */
type Settled = {
  /** The lifted shapes among the lifted elements. */
  shapes: Set<number>;
  /** Each box's shape, by its index, or -1. */
  owners: number[];
  /** The paragraphs of each shape whose text reads as a column. */
  columns: Map<number, ColumnText>;
  /** The markers set as bullets. */
  markers: Set<number>;
};

/** A shape's text as paragraphs, the boxes they replace, and the items whose marker is a bullet. */
type ColumnText = { text: PptxShapeText; boxes: Set<number>; bulleted: Set<number> };

function settle(
  page: PptxPageFacts,
  tree: Tree,
  blocks: Map<number, PptxBlockText>,
  lifted: ReadonlySet<number>,
): Settled {
  const shapes = new Set([...lifted].filter((id) => page.nodes[id]?.paint?.kind === "shape"));
  const owners = page.boxes.map((box) => boxShape(box, tree, shapes));
  const bullets = new Map(page.markers.map((marker) => [marker.node, marker]));
  const columns = new Map<number, ColumnText>();
  for (const shape of shapes) {
    const text = columnOf(shape, page, tree, blocks, lifted, owners, bullets);
    if (text) {
      columns.set(shape, text);
    }
  }
  // A marker is a bullet only where its item is a paragraph of a column; elsewhere it is drawn.
  const markers = new Set([...columns.values()].flatMap((column) => [...column.bulleted]));
  return { shapes, owners, columns, markers };
}

/** The nearest lifted shape that holds every run of the box, or -1. */
function boxShape(box: PptxMeasuredBox, tree: Tree, shapes: ReadonlySet<number>): number {
  const [first, ...rest] = box.runs;
  for (let at = tree.shapeOf(first?.owner ?? -1, shapes); at !== -1; ) {
    if (rest.every((run) => tree.inside(run.owner, at))) {
      return at;
    }
    at = tree.shapeOf(tree.parent(at), shapes);
  }
  return -1;
}

type Line = { top: number; bottom: number; boxes: PptxMeasuredBox[] };

/**
 * A shape's text as paragraphs, when it reads as a column: its blocks one under another, no line
 * with pieces set apart, nothing else laid over in its lines, and each block's runs the text its
 * lines carry.
 */
function columnOf(
  shape: number,
  page: PptxPageFacts,
  tree: Tree,
  blocks: Map<number, PptxBlockText>,
  lifted: ReadonlySet<number>,
  owners: number[],
  markers: ReadonlyMap<number, PptxMarker>,
): ColumnText | undefined {
  const paint = page.nodes[shape]?.paint;
  if (paint?.kind !== "shape") {
    return undefined;
  }
  const mine = new Set(owners.flatMap((owner, index) => (owner === shape ? [index] : [])));
  if (mine.size === 0) {
    return undefined;
  }
  const order: number[] = [];
  for (const index of mine) {
    const block = page.boxes[index]?.block ?? -1;
    if (!order.includes(block)) {
      order.push(block);
    }
  }
  const others = [...lifted].filter((id) => id !== shape && tree.inside(id, shape));
  const content = paint.content;
  const sets: Array<{ block: PptxBlockText; lines: Line[]; pitch: number }> = [];
  for (const id of order) {
    const block = blocks.get(id);
    const all = page.boxes.flatMap((box, index) => (box.block === id ? [index] : []));
    if (!block || block.runs.length === 0 || all.some((index) => !mine.has(index))) {
      return undefined;
    }
    const lines = linesOf(all.map((index) => page.boxes[index] as PptxMeasuredBox));
    if (lines.some((line) => line.boxes.length > 1)) {
      return undefined;
    }
    const carried = lines.flatMap((line) => line.boxes.flatMap((box) => box.runs));
    if (ink(block.runs) !== ink(carried)) {
      return undefined;
    }
    if (block.content.left < content.left - NEAR || block.content.right > content.right + NEAR) {
      return undefined;
    }
    const glyphs = lines[0] ? lines[0].bottom - lines[0].top : 0;
    const second = lines[1];
    const pitch =
      Number.isFinite(block.lineHeight) && block.lineHeight > 0
        ? block.lineHeight
        : second && lines[0]
          ? second.top - lines[0].top
          : glyphs;
    // A paragraph has one pitch; lines set farther apart, as a larger font in one of them sets
    // them, would be drawn closer.
    const first = lines[0];
    const last = lines.at(-1);
    if (
      first &&
      last &&
      lines.length > 1 &&
      Math.abs((last.top - first.top) / (lines.length - 1) - pitch) > NEAR * 2
    ) {
      return undefined;
    }
    sets.push({ block, lines, pitch });
  }
  for (const { lines } of sets) {
    for (const line of lines) {
      const extent = {
        left: content.left,
        top: line.top,
        right: content.right,
        bottom: line.bottom,
      };
      if (others.some((id) => overlaps(tree.extent(id), extent))) {
        return undefined;
      }
    }
  }

  // Each line in its line box: the glyphs centered in the line's height, as CSS sets them.
  const tops = sets.map(({ lines, pitch }) => {
    const first = lines[0] as Line;
    return first.top - (pitch - (first.bottom - first.top)) / 2;
  });
  const bottoms = sets.map(({ lines, pitch }) => {
    const last = lines.at(-1) as Line;
    return last.bottom + (pitch - (last.bottom - last.top)) / 2;
  });
  for (let index = 1; index < sets.length; index++) {
    if ((tops[index] ?? 0) < (bottoms[index - 1] ?? 0) - NEAR) {
      return undefined;
    }
  }

  // PowerPoint numbers the paragraphs of a run of numbered ones on from the first, so the
  // browser's numbers must count on by one, as one list's do; two lists, or a nested one, would
  // be numbered as one.
  const numbers = sets.map(({ block }) => {
    const bullet = markers.get(block.node)?.bullet;
    return bullet && "ordinal" in bullet ? bullet.ordinal : undefined;
  });
  if (
    numbers.some(
      (number, index) =>
        number !== undefined &&
        index > 0 &&
        numbers[index - 1] !== undefined &&
        number !== (numbers[index - 1] ?? 0) + 1,
    )
  ) {
    return undefined;
  }

  const bulleted = new Set<number>();
  let startAt: number | undefined;
  const paragraphs = sets.map(({ block, pitch }, index): PptxParagraph => {
    const marker = markers.get(block.node);
    if (marker) {
      bulleted.add(block.node);
    }
    const kind = marker?.bullet;
    let bullet: PptxParagraph["bullet"];
    if (kind && "ordinal" in kind) {
      startAt ??= kind.ordinal;
      bullet = { startAt };
    } else {
      startAt = undefined;
      bullet = kind ? { char: kind.char } : undefined;
    }
    return {
      align: alignOf(block, sets[index]?.lines ?? []),
      lineHeight: pitch,
      spaceBefore: index === 0 ? 0 : Math.max(0, (tops[index] ?? 0) - (bottoms[index - 1] ?? 0)),
      marginLeft: block.content.left - content.left,
      marginRight: Math.max(0, content.right - block.content.right),
      indent: marker ? marker.extent.left - block.content.left : block.textIndent,
      ...(bullet ? { bullet } : {}),
      runs: block.runs.map(written),
    };
  });

  // DrawingML has no margin below 0, and starts no line left of the text's inset: what starts
  // left of the content box, a bullet hung in its padding or a block a pixel out, moves the
  // inset left, as far as the shape's own edge.
  const rect = tree.rect(shape);
  const shift = Math.min(
    0,
    ...paragraphs.map((paragraph) => paragraph.marginLeft + Math.min(0, paragraph.indent)),
  );
  if (content.left - rect.left + shift < -NEAR) {
    return undefined;
  }
  for (const paragraph of paragraphs) {
    paragraph.marginLeft -= shift;
  }

  // Set from the top, where it starts, as PowerPoint's own text is: it grows down as it is edited,
  // and lands where the browser set it in every renderer, which centering does not.
  return {
    text: {
      inset: {
        left: Math.max(0, content.left - rect.left + shift),
        top: (tops[0] ?? content.top) - rect.top,
        right: rect.right - content.right,
        bottom: rect.bottom - content.bottom,
      },
      wrap: sets.some(({ lines }) => lines.length > 1),
      paragraphs,
    },
    boxes: mine,
    bulleted,
  };
}

/**
 * How a block's lines are aligned, as they sit in its content box: text a flexbox or a grid
 * centers is centered though its `text-align` says nothing of it.
 */
function alignOf(block: PptxBlockText, lines: Line[]): PptxParagraph["align"] {
  if (block.align !== "left" && block.align !== "justify") {
    return block.align;
  }
  const gaps = lines.map((line) => {
    const left = Math.min(...line.boxes.map((box) => box.x));
    const right = Math.max(...line.boxes.map((box) => box.x + box.width));
    return { before: left - block.content.left, after: block.content.right - right };
  });
  if (gaps.length === 0 || gaps.some((gap) => gap.before <= NEAR)) {
    return block.align;
  }
  if (gaps.every((gap) => Math.abs(gap.before - gap.after) <= NEAR * 1.5)) {
    return "center";
  }
  return gaps.every((gap) => gap.after <= NEAR) ? "right" : block.align;
}

/** A block's boxes in lines, top to bottom: boxes whose middles share a line are one. */
function linesOf(boxes: PptxMeasuredBox[]): Line[] {
  const lines: Line[] = [];
  for (const box of [...boxes].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const middle = box.y + box.height / 2;
    const line = lines.find((each) => middle > each.top && middle < each.bottom);
    if (line) {
      line.boxes.push(box);
      line.top = Math.min(line.top, box.y);
      line.bottom = Math.max(line.bottom, box.y + box.height);
    } else {
      lines.push({ top: box.y, bottom: box.y + box.height, boxes: [box] });
    }
  }
  return lines;
}

/** The runs' text without its white space, to compare what two measures of it carry. */
function ink(runs: PptxRun[]): string {
  return runs
    .map((run) => run.text)
    .join("")
    .replace(/\s+/g, "");
}

/** A layer as it is written, for the order to be checked: where it lies and where it paints. */
type Item = { extent: Box; key: PaintKey; node?: number };

/** A layer in its group: where it paints, and itself and what it holds, in the order written. */
type Placed = { key: PaintKey; layer: PptxLayer<PlannedImage>; item: Item; inner: Placed[] };

/** The lifted elements and the text, each in the group of its nearest shape, in paint order. */
function assemble(
  page: PptxPageFacts,
  tree: Tree,
  lifted: ReadonlySet<number>,
  state: Settled,
): Placed[] {
  const held = new Map<number, Placed[]>();
  const place = (shape: number, placed: Placed) => {
    const list = held.get(shape) ?? [];
    list.push(placed);
    held.set(shape, list);
  };
  const inColumn = new Set([...state.columns.values()].flatMap((column) => [...column.boxes]));
  page.boxes.forEach((box, index) => {
    if (inColumn.has(index)) {
      return;
    }
    // A line that holds more than one element's text paints as the latest of them, such as the
    // text in a chip over the chip.
    const key = box.runs
      .map((run) => textKey(tree.key(run.owner)))
      .reduce((latest, each) => (comparePaint(each, latest, tree) > 0 ? each : latest));
    const layer = textLayer(box);
    place(state.owners[index] ?? -1, {
      key,
      layer,
      item: { extent: rect(box.x, box.y, box.width, box.height), key },
      inner: [],
    });
  });
  for (const id of [...lifted].sort((a, b) => a - b)) {
    const node = page.nodes[id];
    if (node?.paint?.kind === "picture") {
      place(tree.shapeOf(node.parent, state.shapes), {
        key: node.key,
        layer: pictureLayer(tree.extent(id), node.paint.description, id),
        item: { extent: tree.extent(id), key: node.key, node: id },
        inner: [],
      });
    }
  }
  // A stable sort: what shares a place stays in the order it was placed.
  const take = (shape: number): Placed[] =>
    (held.get(shape) ?? []).sort((a, b) => comparePaint(a.key, b.key, tree));

  // Shapes come last: each is built from what it holds, deepest first.
  const shapes = [...state.shapes].sort((a, b) => tree.key(b).length - tree.key(a).length || b - a);
  for (const id of shapes) {
    const node = page.nodes[id];
    if (node?.paint?.kind !== "shape") {
      continue;
    }
    const rules = rulesOf(node.rect, node.paint);
    const inner = take(id);
    const text = state.columns.get(id)?.text;
    const parent = tree.shapeOf(node.parent, state.shapes);
    const item = { extent: node.rect, key: node.key, node: id };
    if (!node.paint.fill && !node.paint.outline && !text) {
      // A box that draws only its borders' sides is only those lines, and holds nothing.
      for (const layer of rules) {
        place(parent, { key: node.key, layer, item, inner: [] });
      }
      for (const placed of inner) {
        place(parent, placed);
      }
      continue;
    }
    const shape: PptxShape<PlannedImage> = {
      kind: "shape",
      ...rectOf(node.rect),
      ...(node.paint.fill ? { fill: node.paint.fill } : {}),
      ...(node.paint.outline ? { outline: node.paint.outline } : {}),
      radius: node.paint.radius,
      ...(text ? { text } : {}),
      layers: [...rules, ...inner.map(({ layer }) => layer)],
    };
    place(parent, { key: node.key, layer: shape, item, inner });
  }
  return take(-1);
}

function rect(x: number, y: number, width: number, height: number): Box {
  return { left: x, top: y, right: x + width, bottom: y + height };
}

const SIDES = ["top", "right", "bottom", "left"] as const;

/** Each side of a border that differs per side, a line on its midline from corner to corner. */
function rulesOf(rect: Box, paint: PptxBoxPaint): PptxRule[] {
  return SIDES.flatMap((name): PptxRule[] => {
    const side = paint.sides?.[name];
    if (!side) {
      return [];
    }
    const half = side.width / 2;
    const ends = {
      top: [rect.left, rect.top + half, rect.right, rect.top + half],
      right: [rect.right - half, rect.top, rect.right - half, rect.bottom],
      bottom: [rect.left, rect.bottom - half, rect.right, rect.bottom - half],
      left: [rect.left + half, rect.top, rect.left + half, rect.bottom],
    }[name];
    const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = ends;
    return [{ kind: "rule", x1, y1, x2, y2, width: side.width, paint: side.paint }];
  });
}

function textLayer(box: PptxMeasuredBox): PptxTextLayer {
  const { block: _block, runs, ...rest } = box;
  return { kind: "text", ...rest, runs: runs.map(written) };
}

/** A run as it is written: whose text it was is the page's to know, not the file's. */
function written(run: PptxMeasuredRun): PptxRun {
  const { owner: _owner, ...rest } = run;
  return rest;
}

function pictureLayer(rect: Box, description: string, node: number): PptxPicture<PlannedImage> {
  return { kind: "picture", ...rectOf(rect), description, node };
}

function rectOf(box: Box): { x: number; y: number; width: number; height: number } {
  return { x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top };
}

/**
 * Whether two boxes share more than an edge: more than half a pixel each way, or than half of
 * the thinner, so a hairline counts.
 */
function overlaps(a: Box, b: Box): boolean {
  const across = (from: number, to: number, otherFrom: number, otherTo: number) =>
    Math.min(to, otherTo) - Math.max(from, otherFrom) >
    Math.min(0.5, (to - from) / 2, (otherTo - otherFrom) / 2);
  return across(a.left, a.right, b.left, b.right) && across(a.top, a.bottom, b.top, b.bottom);
}
