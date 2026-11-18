import type {
  PptxFill,
  PptxLayer,
  PptxPaint,
  PptxParagraph,
  PptxPicture,
  PptxProse,
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

// What a PPTX lays over a slide's picture, decided from what the page measured: which boxes and
// pictures become PowerPoint's own, what they are grouped with, which text becomes a shape's
// paragraphs, which a text box of its own, and which stays line by line, and whether the slide's
// background is PowerPoint's. Nothing here touches a page, so every rule ADRs 22, 23, and 99
// write down is checked without a browser.

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

/**
 * A run as the page measures it: the element whose text it is, for its place, and how it is set,
 * by its place among the page's uses, for its faces and its characters' widths.
 */
export type PptxMeasuredRun = PptxRun & {
  owner: number;
  use: number;
  /** Where it paints, when that is not where its element's text does: a pseudo-element's place. */
  key?: PaintKey;
};

/** A line of text, or the part of one that sits together, in the block that sets it. */
export type PptxMeasuredBox = Omit<PptxTextBox, "runs"> & {
  block: number;
  runs: PptxMeasuredRun[];
  /**
   * Where each character of its runs starts, in order, and where the last one ends: one more
   * than its characters. None when the page could not place each.
   */
  stops?: number[];
  /**
   * How far its first character's ink starts from the box, below zero to the left: PowerPoint's
   * glyph keeps the room the browser's feature took from its left, so the box starts that much
   * earlier.
   */
  shift?: number;
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
  /** Its level, when it is a heading: 1 for `<h1>`. */
  heading?: number;
  /** The list it is an item of, by the list's element. */
  list?: number;
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
   * The slide's background, when PowerPoint can paint it as the browser did, or its color with
   * `image` when the pictures the background draws over the color stay in the slide's picture;
   * and whether the slide is a stacking context, so nothing a negative `z-index` puts beneath it
   * is hidden by it.
   */
  slide?: { background?: PptxFill; image?: true; stacking: boolean };
  /** The slide's size, which a text box of its own stays inside. */
  size?: { width: number; height: number };
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
  /** Whether that is its color alone, the pictures it draws over the color left in the picture. */
  backgroundImage?: true;
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
  const set = new Set(texts.pseudos);
  for (const pseudo of paint.pseudos) {
    // One that draws only its text, which was set again, leaves nothing in the picture.
    if (pseudo.bare && set.has(`${pseudo.host}::${pseudo.pseudo}`)) {
      continue;
    }
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
  const whole =
    slide?.plain === true
      ? slideBackground(slide, { width: slide.width, height: slide.height })
      : undefined;
  // Under pictures PowerPoint's background would not draw as the browser did, the color is
  // PowerPoint's all the same, and the pictures stay in the slide's, over nothing (ADR 102).
  const under =
    whole === undefined &&
    slide?.flat === true &&
    slide.image.trim() !== "none" &&
    slide.paint.alpha === 1
      ? ({ kind: "solid", paint: slide.paint } as const)
      : undefined;
  const background = whole ?? under;
  return {
    nodes: paint.nodes,
    drawn,
    markers,
    boxes: texts.boxes,
    blocks: texts.blocks,
    described: paint.described,
    ...(slide
      ? {
          slide: {
            ...(background ? { background } : {}),
            ...(under ? { image: true as const } : {}),
            stacking: slide.stacking,
          },
          size: { width: slide.width, height: slide.height },
        }
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

export function planPptxLayers(page: PptxPageFacts): PptxPlan {
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
    ...(background && page.slide?.image ? { backgroundImage: true as const } : {}),
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
  /** Text no shape took that reads as paragraphs of its own: a block's, or a list's. */
  prose: ProseText[];
  /** The markers set as bullets. */
  markers: Set<number>;
};

/** A column's text as paragraphs, the boxes they replace, and the items whose marker is a bullet. */
type ColumnText = { text: PptxShapeText; boxes: Set<number>; bulleted: Set<number> };

/** A column in a text box of its own: where the box lies, the shape it is in, and its heading's level. */
type ProseText = ColumnText & { frame: Box; shape: number; heading?: number; title?: boolean };

function settle(
  page: PptxPageFacts,
  tree: Tree,
  blocks: Map<number, PptxBlockText>,
  lifted: ReadonlySet<number>,
): Settled {
  const shapes = new Set([...lifted].filter((id) => page.nodes[id]?.paint?.kind === "shape"));
  const owners = page.boxes.map((box) => boxShape(box, tree, shapes));
  const bullets = new Map(page.markers.map((marker) => [marker.node, marker]));
  const blocksOf = (boxes: Iterable<number>): number[] => {
    const order: number[] = [];
    for (const index of boxes) {
      const block = page.boxes[index]?.block ?? -1;
      if (!order.includes(block)) {
        order.push(block);
      }
    }
    return order;
  };
  const columns = new Map<number, ColumnText>();
  for (const shape of shapes) {
    const paint = page.nodes[shape]?.paint;
    const mine = new Set(owners.flatMap((owner, index) => (owner === shape ? [index] : [])));
    if (paint?.kind !== "shape" || mine.size === 0) {
      continue;
    }
    const text = columnOf(
      { content: paint.content, rect: tree.rect(shape) },
      blocksOf(mine),
      mine,
      [...lifted].filter((id) => id !== shape && tree.inside(id, shape)),
      page,
      blocks,
      tree,
      bullets,
    );
    if (text) {
      columns.set(shape, text);
    }
  }

  // What no shape took as its own is a text box a block where the block reads as plain lines,
  // and one for a whole list where its items do, each item a paragraph; the rest stays in lines.
  const taken = new Set([...columns.values()].flatMap((column) => [...column.boxes]));
  const free = page.boxes.flatMap((_, index) => (taken.has(index) ? [] : [index]));
  const order = blocksOf(free);
  const prose: ProseText[] = [];
  const proseOf = (group: number[]): ProseText | undefined => {
    const mine = new Set(free.filter((index) => group.includes(page.boxes[index]?.block ?? -1)));
    const [first] = mine;
    const shape = first === undefined ? -1 : (owners[first] ?? -1);
    if (first === undefined || [...mine].some((index) => owners[index] !== shape)) {
      return undefined;
    }
    const text = columnOf(
      undefined,
      group,
      mine,
      [...lifted].filter((id) => group.some((block) => block >= 0 && tree.inside(id, block))),
      page,
      blocks,
      tree,
      bullets,
    );
    const heading = group.length === 1 ? blocks.get(group[0] ?? -1)?.heading : undefined;
    return text ? { ...text, shape, ...(heading === undefined ? {} : { heading }) } : undefined;
  };
  for (let at = 0; at < order.length; ) {
    const list = blocks.get(order[at] ?? -1)?.list;
    let end = at + 1;
    while (list !== undefined && blocks.get(order[end] ?? -1)?.list === list) {
      end++;
    }
    const group = order.slice(at, end);
    const whole = proseOf(group);
    for (const each of whole ? [whole] : group.length > 1 ? group.map((id) => proseOf([id])) : []) {
      if (each) {
        prose.push(each);
      }
    }
    at = end;
  }
  // The slide's title is its highest heading that is a text box of its own, the first of them,
  // and in no group: PowerPoint keeps a placeholder out of one.
  const title = prose
    .filter((each) => each.heading !== undefined && each.shape === -1)
    .sort((a, b) => (a.heading ?? 0) - (b.heading ?? 0))[0];
  if (title) {
    title.title = true;
  }

  // A marker is a bullet only where its item is a paragraph of a column; elsewhere it is drawn.
  const markers = new Set(
    [...columns.values(), ...prose].flatMap((column) => [...column.bulleted]),
  );
  return { shapes, owners, columns, prose, markers };
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
 * A heading whose lines all start at one place past its content box's edge, with that place as
 * its edge: what a pseudo-element sets before its words, a number or a mark, the two side by
 * side, starts every line of the words that far in. The words are then lines at one margin, a
 * text box of their own, which the slide's title has to be (ADR 101). Only a heading: lines
 * that anything else starts off their edge stay where they stand, as ADR 99 has them.
 */
function headingFromItsLines(block: PptxBlockText, lines: Line[]): PptxBlockText {
  if (block.heading === undefined) {
    return block;
  }
  const starts = lines.flatMap((line) => (line.boxes[0] ? [line.boxes[0].x] : []));
  const start = Math.min(...starts);
  const from = { ...block, content: { ...block.content, left: start }, textIndent: 0 };
  if (block.align === "left" || block.align === "justify") {
    const off = start - block.content.left - block.textIndent;
    return starts.length > 0 &&
      off > NEAR * 2 &&
      starts.every((each) => Math.abs(each - start) <= NEAR * 2)
      ? from
      : block;
  }
  // One line its style centers or sets to the right, which stands elsewhere for what is set
  // before it, is set from where it starts: there is no other line for a margin to be wrong for.
  const [line] = lines;
  return lines.length === 1 && line && strays(block.align, block, line)
    ? { ...from, align: "left" }
    : block;
}

/**
 * Whether a line stands more than two pixels from where a paragraph aligned as `align` would
 * set it in the block's content box: for centered text, half of what its two margins differ by.
 */
function strays(align: PptxParagraph["align"], block: PptxBlockText, line: Line): boolean {
  const left = Math.min(...line.boxes.map((box) => box.x));
  const right = Math.max(...line.boxes.map((box) => box.x + box.width));
  const before = left - block.content.left;
  const after = block.content.right - right;
  return align === "center"
    ? Math.abs(before - after) / 2 > NEAR * 2
    : align === "right" && Math.abs(after) > NEAR * 2;
}

/** How much room, in pixels, a line needs past its end for PowerPoint not to break it again. */
const FIT = 0.75;
/** How much a wrapping text's far edge is moved out, so a line that just fit still fits. */
const GIVE = 1.5;

/**
 * Some blocks' text as paragraphs, when it reads as a column: the blocks one under another, no
 * line with pieces set apart, nothing else laid over in its lines, each block's runs the text
 * its lines carry, and each line where its alignment puts it. `holder` is the shape that holds
 * the column, its content box and its own; without one the column is free, in a box of its own
 * that covers its blocks. Every line the browser broke is broken in the paragraph too, so
 * PowerPoint, which breaks a line where it is full and not by the phrase, breaks where the
 * browser did; the box wraps what is typed into it where every line has room in it.
 */
function columnOf(
  holder: { content: Box; rect: Box } | undefined,
  order: number[],
  mine: ReadonlySet<number>,
  others: number[],
  page: PptxPageFacts,
  blocks: Map<number, PptxBlockText>,
  tree: Tree,
  markers: ReadonlyMap<number, PptxMarker>,
): (ColumnText & { frame: Box }) | undefined {
  if (mine.size === 0) {
    return undefined;
  }
  const sets: Array<{ block: PptxBlockText; lines: Line[]; pitch: number }> = [];
  for (const id of order) {
    const measured = blocks.get(id);
    const all = page.boxes.flatMap((box, index) => (box.block === id ? [index] : []));
    if (!measured || measured.runs.length === 0 || all.some((index) => !mine.has(index))) {
      return undefined;
    }
    const lines = linesOf(all.map((index) => page.boxes[index] as PptxMeasuredBox));
    if (lines.some((line) => line.boxes.length > 1)) {
      return undefined;
    }
    const block = holder ? measured : headingFromItsLines(measured, lines);
    const carried = lines.flatMap((line) => line.boxes.flatMap((box) => box.runs));
    if (ink(block.runs) !== ink(carried)) {
      return undefined;
    }
    if (
      holder &&
      (block.content.left < holder.content.left - NEAR ||
        block.content.right > holder.content.right + NEAR)
    ) {
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
  const content = holder?.content ?? {
    left: Math.min(...sets.map(({ block }) => block.content.left)),
    top: Number.NEGATIVE_INFINITY,
    right: Math.max(...sets.map(({ block }) => block.content.right)),
    bottom: Number.POSITIVE_INFINITY,
  };
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

  const aligns = sets.map(({ block, lines }) => alignOf(block, lines));
  // A paragraph starts every line at its margin: lines the browser started elsewhere, around a
  // float or after something set before them, would move. So would a line that starts with an
  // indent `white-space` keeps: its spaces could be the paragraph's, but Quick Look drops one
  // space from the start of every line, so such a line stays a box of its own, where it stood.
  for (const [index, { block, lines }] of sets.entries()) {
    const marker = markers.get(block.node);
    const moved = lines.some((line, at) => {
      const start = block.content.left + (at === 0 && !marker ? block.textIndent : 0);
      return Math.abs((line.boxes[0]?.x ?? start) - start) > NEAR * 2;
    });
    if (moved && (aligns[index] === "left" || aligns[index] === "justify")) {
      return undefined;
    }
    // So does text its style centers or sets to the right, where the browser put a line
    // elsewhere: after something set before it, the two side by side, as a dot in a chip is.
    if (lines.some((line) => strays(aligns[index] ?? "left", block, line))) {
      return undefined;
    }
    // Nor does one set another element in its lines: a badge or an icon the browser set beside
    // the words, whether it is laid over the picture or left in it, would lie under them.
    const worded = new Set<number>();
    for (const run of block.runs) {
      for (let at = run.owner; at >= 0 && at !== block.node; at = tree.parent(at)) {
        worded.add(at);
      }
    }
    const beside = page.nodes.some(
      (node, id) =>
        block.node >= 0 &&
        id !== block.node &&
        !worded.has(id) &&
        tree.inside(id, block.node) &&
        lines.some((line) =>
          overlaps(node.rect, {
            left: block.content.left,
            top: line.top,
            right: block.content.right,
            bottom: line.bottom,
          }),
        ),
    );
    if (beside) {
      return undefined;
    }
  }

  const bulleted = new Set<number>();
  let startAt: number | undefined;
  const paragraphs = sets.map(({ block, lines, pitch }, index): PptxParagraph => {
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
      align: aligns[index] ?? "left",
      lineHeight: pitch,
      spaceBefore: index === 0 ? 0 : Math.max(0, (tops[index] ?? 0) - (bottoms[index - 1] ?? 0)),
      marginLeft: block.content.left - content.left,
      marginRight: Math.max(0, content.right - block.content.right),
      indent: marker ? marker.extent.left - block.content.left : block.textIndent,
      ...(bullet ? { bullet } : {}),
      runs: pinned(block.runs, lines),
    };
  });

  // DrawingML has no margin below 0, and starts no line left of the text's inset: what starts
  // left of the content box, a bullet hung in its padding or a block a pixel out, moves the
  // inset left, as far as the shape's own edge; a free column's box starts there.
  const shift = Math.min(
    0,
    ...paragraphs.map((paragraph) => paragraph.marginLeft + Math.min(0, paragraph.indent)),
  );
  if (holder && content.left - holder.rect.left + shift < -NEAR) {
    return undefined;
  }
  for (const paragraph of paragraphs) {
    paragraph.marginLeft -= shift;
  }

  // PowerPoint breaks a line that does not fit: text wraps only where every line the browser
  // set has room past its end, and a text all on one line only where it has room to spare, so
  // that a chip drawn to its text's width never breaks it.
  const rooms = sets.flatMap(({ block, lines }) =>
    lines.map((line) => {
      const width = line.boxes[0]?.width ?? 0;
      return { room: block.content.right - block.content.left - width, width };
    }),
  );
  const flush = aligns.every((align) => align === "left" || align === "justify");
  const centered = aligns.every((align) => align === "center");
  const right = aligns.every((align) => align === "right");
  // How far the text's room can grow on the side its lines end on: into a shape's padding, or
  // for a box of its own up to the slide's edge, on both sides alike for centered text.
  const within = page.size ? page.size.width - content.right : Number.POSITIVE_INFINITY;
  const reach = holder
    ? flush
      ? Math.max(0, holder.rect.right - content.right)
      : 0
    : Math.max(
        0,
        flush ? within : right ? content.left + shift : Math.min(within, content.left + shift),
      );
  const give = Math.min(GIVE, reach);
  const multiline = sets.some(({ lines }) => lines.length > 1);
  const wrap =
    rooms.every(({ room }) => room + give >= FIT) &&
    (multiline || rooms.every(({ room, width }) => room >= Math.max(2, width * 0.03)));

  const top = tops[0] ?? content.top;
  const bottom = bottoms.at(-1) ?? content.bottom;
  if (!holder) {
    // A box of its own: as wide as its blocks, and wider past where its lines end, by a little
    // where it wraps and by a good part of a line where it does not, so a renderer that sets a
    // line a hair longer, or wraps a text that says not to, has the room. The box grows on the
    // side its lines end on, or on both for centered text, never by a margin: a renderer that
    // skips a paragraph's right margin would center the text elsewhere. It stays on the slide.
    if ((!flush && !centered && !right) || (centered && shift !== 0)) {
      return undefined;
    }
    const widest = Math.max(...rooms.map(({ width }) => width));
    const spare = wrap ? give : Math.min(reach, Math.max(widest * 0.25, (sets[0]?.pitch ?? 0) * 2));
    // Lines that all begin with a character whose ink a feature moved left, as `palt` moves an
    // opening bracket's, begin that much earlier: PowerPoint's glyph keeps the room on its left,
    // so the box starts there, and for centered text is that much wider on the left.
    const leads = sets.flatMap(({ lines }) => lines.map((line) => line.boxes[0]?.shift ?? 0));
    const [first = 0] = leads;
    const lead =
      right || leads.some((each) => Math.abs(each - first) > NEAR / 4)
        ? 0
        : Math.max(first, -(content.left + shift - (flush ? 0 : spare)));
    return {
      text: { inset: { left: 0, top: 0, right: 0, bottom: 0 }, wrap, paragraphs },
      boxes: new Set(mine),
      bulleted,
      frame: {
        left: content.left + shift + lead - (flush ? 0 : spare),
        top,
        right: content.right + (right ? 0 : spare),
        bottom,
      },
    };
  }
  // Text that starts above its shape, as a label set over a card's edge does, has no inset to
  // start it there: its blocks are set each in a box of its own.
  if (top < holder.rect.top - NEAR) {
    return undefined;
  }

  // Set from the top, where it starts, as PowerPoint's own text is: it grows down as it is edited,
  // and lands where the browser set it in every renderer, which centering does not. Text that
  // wraps is given a little of the padding past its lines' ends, and text that does not, all of
  // it: no line is broken for a hair's width.
  const { rect } = holder;
  return {
    text: {
      inset: {
        left: Math.max(0, content.left - rect.left + shift),
        top: top - rect.top,
        right: wrap ? rect.right - content.right - give : flush ? 0 : rect.right - content.right,
        bottom: rect.bottom - content.bottom,
      },
      wrap,
      paragraphs,
    },
    boxes: new Set(mine),
    bulleted,
    frame: rect,
  };
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * A block's runs as they are written, with a line break wherever the browser broke a line: the
 * break stands before the first character of the next line, after the space the line ended on.
 */
function pinned(runs: PptxMeasuredRun[], lines: Line[]): PptxRun[] {
  const counts = lines.map(
    (line) => [...segmenter.segment(ink(line.boxes.flatMap((box) => box.runs)))].length,
  );
  let line = 0;
  let inked = 0;
  // Whether a break already stands before the character to come, as a `<br>` puts one.
  let broken = true;
  return runs.map((run) => {
    let text = "";
    for (const { segment } of segmenter.segment(run.text)) {
      if (segment === "\n") {
        broken = true;
      } else if (!/^\s+$/u.test(segment)) {
        if (inked >= (counts[line] ?? Number.POSITIVE_INFINITY)) {
          text += broken ? "" : "\n";
          line++;
          inked = 0;
        }
        inked++;
        broken = false;
      }
      text += segment;
    }
    return { ...written(run), text };
  });
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
  const inColumn = new Set(
    [...state.columns.values(), ...state.prose].flatMap((column) => [...column.boxes]),
  );
  // Text that holds more than one element's text paints as the latest of them, such as the
  // text in a chip over the chip.
  const keyOf = (boxes: PptxMeasuredBox[]): PaintKey =>
    boxes
      .flatMap((box) => box.runs.map((run) => run.key ?? textKey(tree.key(run.owner))))
      .reduce((latest, each) => (comparePaint(each, latest, tree) > 0 ? each : latest));
  for (const prose of state.prose) {
    const boxes = [...prose.boxes].flatMap((index) => page.boxes[index] ?? []);
    const key = keyOf(boxes);
    const layer: PptxProse = {
      kind: "prose",
      ...rectOf(prose.frame),
      text: prose.text,
      ...(prose.title ? { title: true } : {}),
    };
    // What it covers is its lines, not the whole width its box is given.
    const extent = {
      left: Math.min(...boxes.map((box) => box.x)),
      top: Math.min(...boxes.map((box) => box.y)),
      right: Math.max(...boxes.map((box) => box.x + box.width)),
      bottom: Math.max(...boxes.map((box) => box.y + box.height)),
    };
    place(prose.shape, { key, layer, item: { extent, key }, inner: [] });
  }
  page.boxes.forEach((box, index) => {
    if (inColumn.has(index)) {
      return;
    }
    const key = keyOf([box]);
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
  const { block: _block, runs, stops: _stops, shift = 0, ...rest } = box;
  return {
    kind: "text",
    ...rest,
    x: rest.x + shift,
    width: rest.width - shift,
    runs: runs.map(written),
  };
}

/** A run as it is written: whose text it was and how it was set is the page's to know, not the file's. */
function written(run: PptxMeasuredRun): PptxRun {
  const { owner: _owner, use: _use, key: _key, ...rest } = run;
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
