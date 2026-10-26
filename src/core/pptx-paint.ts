/// <reference lib="dom" />
// What a PPTX with `--shapes` reads of a slide's paint: each element, where the browser paints
// it and what it draws of its own, what its pseudo-elements and list marker draw, and each
// picture as itself; then, once the plan is made, each picture drawn alone and the lifted paint
// taken out of the slide's picture. Each function here runs in the page, shipped by
// `page.evaluate`, so it references nothing outside itself.

import type { PaintKey, PptxNodePaint, PptxPaintNode } from "./pptx-plan.ts";
import type { Box } from "./slide-measure.ts";

/** The attribute that marks an element whose pseudo-element or marker draws, by its node. */
export const PPTX_PSEUDO_ATTR = "data-dek-pptx-pseudo";

/** A pseudo-element or a list marker that draws, before Chromium says where it lies. */
type PptxPseudoPaint = {
  /** The element it belongs to, -1 for the slide. */
  host: number;
  pseudo: "before" | "after" | "marker";
  key: PaintKey;
  /** How far its shadows and outline reach past its box. */
  reach: number;
  /** For a marker PowerPoint has a bullet for, which. */
  bullet?: { char: string } | { ordinal: number };
};

export type PptxPagePaint = {
  /** Where the slide is in the viewport, which the boxes Chromium reports are in. */
  origin: { left: number; top: number };
  nodes: PptxPaintNode[];
  pseudos: PptxPseudoPaint[];
  described: Array<{ node: number; text: string }>;
};

/**
 * Numbers every element of the slide, as `data-dek-pptx-node`, its index among the nodes, and
 * reads what each draws of its own: a box PowerPoint can
 * draw as a shape, a picture to draw alone, or paint that stays drawn. Marks each element whose
 * pseudo-elements or marker draw, for Chromium to say where they lie.
 */
export function measurePptxPaintInPage(): Omit<PptxPagePaint, "described"> {
  const slide = document.querySelector("#deck > .slide");
  if (!(slide instanceof HTMLElement)) {
    return { origin: { left: 0, top: 0 }, nodes: [], pseudos: [] };
  }
  const origin = slide.getBoundingClientRect();
  const local = (rect: DOMRect | Box): Box => ({
    left: rect.left - origin.left,
    top: rect.top - origin.top,
    right: rect.right - origin.left,
    bottom: rect.bottom - origin.top,
  });

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const paint = canvas.getContext("2d", { willReadFrequently: true });
  /**
   * A computed color as sRGB: read as it is written when it is `rgb()`, as Chromium writes an
   * sRGB color, so a faint one keeps its channels; drawn when it is in another space.
   */
  const rgba = (value: string): { color: [number, number, number]; alpha: number } => {
    const written = /^rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)$/.exec(
      value,
    );
    if (written) {
      const [, r = "0", g = "0", b = "0", a = "1"] = written;
      const channel = (part: string) => Math.max(0, Math.min(255, Math.round(Number(part))));
      return {
        color: [channel(r), channel(g), channel(b)],
        alpha: Math.max(0, Math.min(1, Number(a))),
      };
    }
    if (!paint) {
      return { color: [0, 0, 0], alpha: 0 };
    }
    paint.clearRect(0, 0, 1, 1);
    // A value the canvas cannot read leaves its fill as it was: nothing, not the last color.
    paint.fillStyle = "rgba(0, 0, 0, 0)";
    paint.fillStyle = value;
    paint.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0, a = 0] = paint.getImageData(0, 0, 1, 1).data;
    return { color: [r, g, b], alpha: a / 255 };
  };
  const px = (value: string): number => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  /** How far a shadow list reaches past the box: every length in it, added up, at most. */
  const reachOf = (value: string): number =>
    value === "none"
      ? 0
      : (value.match(/-?\d*\.?\d+px/g) ?? []).reduce(
          (sum, length) => sum + Math.abs(px(length)),
          0,
        );

  const nodes: PptxPaintNode[] = [];
  const pseudos: PptxPseudoPaint[] = [];
  /** The index past the last element each node holds, for what its `::after` paints over. */
  const ends: number[] = [];

  /** Whether one of the transform properties says anything; `transform` itself is read apart. */
  const set = (value: string): boolean => value !== "none" && value !== "";

  const layerOf = (style: CSSStyleDeclaration, parent: Element | null): number => {
    const positioned = style.position !== "static";
    const display = parent ? getComputedStyle(parent).display : "";
    const z = style.zIndex === "auto" ? undefined : Number(style.zIndex);
    if (z !== undefined && Number.isFinite(z) && (positioned || /flex|grid/.test(display))) {
      return z < 0 ? z : z + 1;
    }
    const stacking =
      Number(style.opacity) < 1 ||
      style.transform !== "none" ||
      set(style.rotate) ||
      set(style.scale) ||
      set(style.translate) ||
      style.filter !== "none" ||
      style.isolation === "isolate" ||
      style.mixBlendMode !== "normal" ||
      style.clipPath !== "none" ||
      (style.maskImage !== "none" && style.maskImage !== "");
    return positioned || stacking ? 1 : 0;
  };

  /**
   * What scales the element, its own `transform` and `scale` and what it is in: none when one
   * of them rotates, skews, or scales it unevenly, or `zoom` sets it at another size than its
   * computed lengths say, none of which a shape follows.
   */
  const scaleOf = (style: CSSStyleDeclaration, outer: number | undefined): number | undefined => {
    if (
      outer === undefined ||
      set(style.rotate) ||
      (style.zoom !== "" && Number(style.zoom) !== 1)
    ) {
      return undefined;
    }
    let scale = outer;
    if (set(style.scale)) {
      const [x = Number.NaN, y = x, z = 1] = style.scale.split(/\s+/).map(Number);
      if (!(x > 0) || Math.abs(x - y) > 1e-6 || z !== 1) {
        return undefined;
      }
      scale *= x;
    }
    if (style.transform === "none" || style.transform === "") {
      return scale;
    }
    const matrix = new DOMMatrixReadOnly(style.transform);
    if (!matrix.is2D || Math.abs(matrix.b) > 1e-6 || Math.abs(matrix.c) > 1e-6) {
      return undefined;
    }
    if (Math.abs(matrix.a - matrix.d) > 1e-6 || matrix.a <= 0) {
      return undefined;
    }
    return scale * matrix.a;
  };

  /**
   * How the element paints among the blocks of its stacking context (CSS 2, Appendix E): a float
   * after their backgrounds, and inline-level content, an inline block, a flex or grid item, or
   * replaced content such as an image, block-level or not, after the floats too; a block, unset,
   * in its place among them.
   */
  const flowOf = (
    style: CSSStyleDeclaration,
    parent: Element,
    replaced: boolean,
  ): PptxPaintNode["flow"] => {
    if (style.float !== "none") {
      return "float";
    }
    if (
      replaced ||
      style.display.startsWith("inline") ||
      /flex|grid/.test(getComputedStyle(parent).display)
    ) {
      return "inline";
    }
    return undefined;
  };

  /** Whether the box reaches past the viewport, which a shot of it would cut. */
  const offscreen = (rect: DOMRect): boolean =>
    rect.left < -0.5 ||
    rect.top < -0.5 ||
    rect.right > window.innerWidth + 0.5 ||
    rect.bottom > window.innerHeight + 0.5;

  const effects = (style: CSSStyleDeclaration): boolean =>
    style.filter !== "none" ||
    (style.backdropFilter !== "none" && style.backdropFilter !== "") ||
    style.mixBlendMode !== "normal" ||
    style.clipPath !== "none" ||
    (style.maskImage !== "none" && style.maskImage !== "");

  /** The radius of a corner, horizontal and vertical, in pixels of the box. */
  const corner = (value: string, width: number, height: number): [number, number] => {
    const [h = "0", v = h] = value.split(" ");
    const length = (part: string, of: number) =>
      part.endsWith("%") ? (px(part) / 100) * of : px(part);
    return [length(h, width), length(v, height)];
  };

  /** Whether an ancestor's clipping, square or round, cuts into the box. */
  const clipped = (el: Element, rect: DOMRect): boolean => {
    for (let node = el.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.overflowX !== "visible" || style.overflowY !== "visible") {
        const outer = node.getBoundingClientRect();
        const clip = {
          left: outer.left + px(style.borderLeftWidth),
          top: outer.top + px(style.borderTopWidth),
          right: outer.right - px(style.borderRightWidth),
          bottom: outer.bottom - px(style.borderBottomWidth),
        };
        if (
          rect.left < clip.left - 0.5 ||
          rect.top < clip.top - 0.5 ||
          rect.right > clip.right + 0.5 ||
          rect.bottom > clip.bottom + 0.5
        ) {
          return true;
        }
        const [radius] = corner(style.borderTopLeftRadius, outer.width, outer.height);
        const round = Math.max(
          radius,
          corner(style.borderTopRightRadius, outer.width, outer.height)[0],
          corner(style.borderBottomRightRadius, outer.width, outer.height)[0],
          corner(style.borderBottomLeftRadius, outer.width, outer.height)[0],
        );
        const nearX = rect.left < clip.left + round || rect.right > clip.right - round;
        const nearY = rect.top < clip.top + round || rect.bottom > clip.bottom - round;
        if (round > 0 && nearX && nearY) {
          return true;
        }
      }
      if (node === slide) {
        break;
      }
    }
    return false;
  };

  const SIDES = ["Top", "Right", "Bottom", "Left"] as const;

  /** What the element draws of its own box: a shape, paint that stays drawn, or nothing. */
  const boxPaint = (
    el: Element,
    style: CSSStyleDeclaration,
    rect: DOMRect,
    scale: number | undefined,
    opacity: number,
    effect: boolean,
  ): PptxNodePaint | undefined => {
    const background = rgba(style.backgroundColor);
    const image = style.backgroundImage !== "none";
    const sides = SIDES.map((side) => ({
      width: px(style.getPropertyValue(`border-${side.toLowerCase()}-width`)),
      style: style.getPropertyValue(`border-${side.toLowerCase()}-style`),
      color: rgba(style.getPropertyValue(`border-${side.toLowerCase()}-color`)),
    })).map((side) => ({
      ...side,
      drawn:
        side.width > 0 && side.style !== "none" && side.style !== "hidden" && side.color.alpha > 0,
    }));
    const shadow = reachOf(style.boxShadow);
    const outline =
      style.outlineStyle !== "none" && px(style.outlineWidth) > 0
        ? px(style.outlineWidth) + Math.max(0, px(style.outlineOffset))
        : 0;
    const paints =
      background.alpha > 0 ||
      image ||
      sides.some((side) => side.drawn) ||
      shadow > 0 ||
      outline > 0;
    if (!paints || style.visibility !== "visible" || opacity === 0) {
      return undefined;
    }
    const reach = Math.max(shadow, outline);
    const drawn: PptxNodePaint = {
      kind: "drawn",
      extent: local({
        left: rect.left - reach,
        top: rect.top - reach,
        right: rect.right + reach,
        bottom: rect.bottom + reach,
      }),
    };
    const collapsed =
      /^table/.test(style.display) &&
      sides.some((side) => side.drawn) &&
      getComputedStyle(el.closest("table") ?? el).borderCollapse === "collapse";
    if (
      image ||
      reach > 0 ||
      effect ||
      scale === undefined ||
      collapsed ||
      el.getClientRects().length !== 1 ||
      sides.some((side) => side.drawn && side.style !== "solid") ||
      !/^(border|padding)-box$/.test(style.backgroundClip) ||
      clipped(el, rect) ||
      offscreen(rect)
    ) {
      return drawn;
    }
    const corners = [
      style.borderTopLeftRadius,
      style.borderTopRightRadius,
      style.borderBottomRightRadius,
      style.borderBottomLeftRadius,
    ].map((value) => corner(value, rect.width / scale, rect.height / scale));
    const [[radius = 0, vertical = 0] = []] = corners;
    if (corners.some(([h, v]) => Math.abs(h - radius) > 0.01 || Math.abs(v - vertical) > 0.01)) {
      return drawn;
    }
    // CSS shrinks corners that do not fit by one factor for both radii, so an elliptical corner,
    // such as 50% of a box that is not square, stays elliptical; PowerPoint's are circular.
    if (Math.abs(radius - vertical) > 0.01) {
      return drawn;
    }
    const painted = sides.filter((side) => side.drawn);
    // A corner rounder than its border is wide has a path on the midline to round; one less round
    // would be a square path, its outer corner square where CSS rounds it.
    if (radius > 0 && painted.some((side) => radius < side.width / 2)) {
      return drawn;
    }
    const same =
      painted.length === 4 &&
      painted.every(
        (side) =>
          Math.abs(side.width - (painted[0]?.width ?? 0)) < 0.01 &&
          side.color.color.join() === painted[0]?.color.color.join() &&
          side.color.alpha === painted[0]?.color.alpha,
      );
    if (painted.length > 0 && !same && radius > 0) {
      return drawn;
    }
    const paintOf = (color: { color: [number, number, number]; alpha: number }) => ({
      color: color.color,
      alpha: Math.round(color.alpha * opacity * 1000) / 1000,
    });
    const inset = SIDES.map(
      (side, index) =>
        ((sides[index]?.drawn ? (sides[index]?.width ?? 0) : 0) +
          px(style.getPropertyValue(`padding-${side.toLowerCase()}`))) *
        scale,
    );
    const [top = 0, right = 0, bottom = 0, left = 0] = inset;
    return {
      kind: "shape",
      content: local({
        left: rect.left + left,
        top: rect.top + top,
        right: rect.right - right,
        bottom: rect.bottom - bottom,
      }),
      ...(background.alpha > 0 ? { fill: paintOf(background) } : {}),
      ...(same && painted[0]
        ? { outline: { width: painted[0].width * scale, paint: paintOf(painted[0].color) } }
        : {}),
      ...(!same && painted.length > 0
        ? {
            sides: Object.fromEntries(
              SIDES.flatMap((side, index) => {
                const drawnSide = sides[index];
                return drawnSide?.drawn
                  ? [
                      [
                        side.toLowerCase(),
                        { width: drawnSide.width * scale, paint: paintOf(drawnSide.color) },
                      ],
                    ]
                  : [];
              }),
            ),
          }
        : {}),
      radius: Math.min(radius * scale, Math.max(rect.width, rect.height)),
    };
  };

  const PICTURES = new Set(["img", "canvas", "svg"]);
  const REPLACED = new Set([
    "video",
    "iframe",
    "object",
    "embed",
    "input",
    "textarea",
    "select",
    "meter",
    "progress",
  ]);

  const describe = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    const title = tag === "svg" ? el.querySelector(":scope > title")?.textContent : undefined;
    return (el.getAttribute("alt") ?? el.getAttribute("aria-label") ?? title ?? "").trim();
  };

  const BULLETS: Record<string, string> = { disc: "•", circle: "◦", square: "▪" };

  /** The bullet PowerPoint draws for an item's marker, if it has one. */
  const bulletOf = (el: Element, style: CSSStyleDeclaration): PptxPseudoPaint["bullet"] => {
    const marker = getComputedStyle(el, "::marker");
    if (style.listStyleImage !== "none" || (marker.content !== "normal" && marker.content !== "")) {
      return undefined;
    }
    const char = BULLETS[style.listStyleType];
    if (char) {
      return { char };
    }
    if (style.listStyleType !== "decimal") {
      return undefined;
    }
    const list = el.parentElement;
    if (!list || list.hasAttribute("reversed")) {
      return undefined;
    }
    const items = [...list.children].filter((item) =>
      getComputedStyle(item).display.includes("list-item"),
    );
    if (items.some((item) => item.hasAttribute("value"))) {
      return undefined;
    }
    const start = list.tagName.toLowerCase() === "ol" ? Number(list.getAttribute("start") ?? 1) : 1;
    // PowerPoint counts from 1 to 32767; a list numbered outside that keeps its marker drawn.
    return Number.isInteger(start) && start >= 1 && start + items.length - 1 <= 32767
      ? { ordinal: start + items.indexOf(el) }
      : undefined;
  };

  /** The pseudo-elements of `el` that draw, and its marker, with where each paints. */
  const pseudoPaints = (el: Element, host: number, key: PaintKey, index: number) => {
    let drawn = false;
    for (const pseudo of ["before", "after"] as const) {
      const style = getComputedStyle(el, `::${pseudo}`);
      if (style.content === "none" || style.content === "normal" || style.display === "none") {
        continue;
      }
      const box =
        rgba(style.backgroundColor).alpha > 0 ||
        style.backgroundImage !== "none" ||
        reachOf(style.boxShadow) > 0 ||
        SIDES.some((side) => px(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0);
      if ((style.content === '""' && !box) || style.visibility !== "visible") {
        continue;
      }
      const at = pseudo === "before" ? index + 0.25 : -1;
      pseudos.push({
        host,
        pseudo,
        key: [...key, layerOf(style, el), at],
        reach: Math.max(reachOf(style.boxShadow), reachOf(style.textShadow)),
      });
      drawn = true;
    }
    const style = getComputedStyle(el);
    if (
      style.display.includes("list-item") &&
      (style.listStyleType !== "none" || style.listStyleImage !== "none") &&
      rgba(getComputedStyle(el, "::marker").color).alpha > 0
    ) {
      const bullet = bulletOf(el, style);
      pseudos.push({
        host,
        pseudo: "marker",
        key: [...key, 0, index + 0.1],
        reach: 0,
        ...(bullet ? { bullet } : {}),
      });
      drawn = true;
    }
    if (drawn) {
      el.setAttribute("data-dek-pptx-pseudo", String(host));
    }
  };

  /**
   * Each element `el` holds, in the document's order: `scale` is what scales it, none when
   * something rotates or skews it, `opacity` all it is in, and `effect` whether a filter, blend,
   * clip path, or mask of something it is in changes how it looks.
   */
  const visit = (
    el: Element,
    parent: number,
    key: PaintKey,
    scale: number | undefined,
    opacity: number,
    effect: boolean,
  ) => {
    for (const child of el.children) {
      const tag = child.tagName.toLowerCase();
      if (tag === "script" || tag === "style" || tag === "template") {
        continue;
      }
      const style = getComputedStyle(child);
      const id = nodes.length;
      child.setAttribute("data-dek-pptx-node", String(id));
      const own = [...key, layerOf(style, el), id];
      const rect = child.getBoundingClientRect();
      const childScale = scaleOf(style, scale);
      const childOpacity = opacity * Number(style.opacity);
      const childEffect = effect || effects(style);
      const flow = flowOf(style, el, PICTURES.has(tag) || REPLACED.has(tag));
      const node: PptxPaintNode = {
        parent,
        key: own,
        rect: local(rect),
        ...(flow ? { flow } : {}),
      };
      nodes.push(node);
      ends.push(id + 1);
      const laidOut = child.getClientRects().length > 0 && rect.width > 0 && rect.height > 0;
      const visible = style.visibility === "visible" && childOpacity > 0;
      if (child.shadowRoot !== null || tag.includes("-")) {
        // What a shadow root draws is out of reach, and a custom element may have a closed one.
        if (laidOut && visible) {
          node.paint = { kind: "drawn", extent: node.rect };
        }
        continue;
      }
      if (PICTURES.has(tag)) {
        if (laidOut && visible) {
          const blended = childEffect && style.mixBlendMode !== "normal";
          // A shot of the picture alone is its drawing whole, its shadow and outline with it, so
          // nothing may cut it.
          const reach =
            reachOf(style.boxShadow) +
            (style.outlineStyle !== "none" && px(style.outlineWidth) > 0
              ? px(style.outlineWidth) + Math.max(0, px(style.outlineOffset))
              : 0);
          const whole = new DOMRect(
            rect.left - reach,
            rect.top - reach,
            rect.width + reach * 2,
            rect.height + reach * 2,
          );
          const extent = local(whole);
          node.paint =
            childScale === undefined || blended || clipped(child, whole) || offscreen(whole)
              ? { kind: "drawn", extent }
              : {
                  kind: "picture",
                  description: describe(child),
                  ...(reach > 0 ? { extent } : {}),
                };
        }
        // An SVG is drawn as a whole: nothing inside it is an element of its own here.
        continue;
      }
      if (REPLACED.has(tag)) {
        if (laidOut && visible) {
          node.paint = { kind: "drawn", extent: node.rect };
        }
        continue;
      }
      if (laidOut) {
        const own = boxPaint(child, style, rect, childScale, childOpacity, childEffect);
        if (own) {
          node.paint = own;
        }
      }
      pseudoPaints(child, id, node.key, id);
      visit(child, id, node.key, childScale, childOpacity, childEffect);
      ends[id] = nodes.length;
    }
  };

  pseudoPaints(slide, -1, [], -1);
  visit(slide, -1, [], 1, 1, false);
  ends.push(nodes.length);
  // An `::after` paints after everything its element holds.
  for (const pseudo of pseudos) {
    if (pseudo.pseudo === "after") {
      pseudo.key[pseudo.key.length - 1] =
        (pseudo.host === -1 ? nodes.length : (ends[pseudo.host] ?? 0)) - 0.25;
    }
  }

  return { origin: { left: origin.left, top: origin.top }, nodes, pseudos };
}

/**
 * What the slide's pictures say they show, by the element that says it as
 * `measurePptxPaintInPage` numbered it, -1 when it did not: each `alt`, `aria-label`, and SVG
 * `<title>` outside `aria-hidden`, in the document's order.
 */
export function describePptxPicturesInPage(): PptxPagePaint["described"] {
  const slide = document.querySelector("#deck > .slide");
  if (!(slide instanceof HTMLElement)) {
    return [];
  }
  return [...slide.querySelectorAll("img[alt], [aria-label], svg > title")].flatMap((el) => {
    if (el.closest('[aria-hidden="true"]')) {
      return [];
    }
    const title = el.tagName.toLowerCase() === "title";
    const said =
      (title ? el.textContent : (el.getAttribute("alt") ?? el.getAttribute("aria-label"))) ?? "";
    const marked = (title ? el.closest("svg") : el)?.getAttribute("data-dek-pptx-node");
    return said.trim() === ""
      ? []
      : [{ node: marked == null ? -1 : Number(marked), text: said.trim() }];
  });
}

/** The paint an inline SVG's elements take from CSS, written back as attributes. */
export const SVG_PAINT = [
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "opacity",
  "visibility",
  "display",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
  "dominant-baseline",
  "letter-spacing",
  "stop-color",
  "stop-opacity",
  "clip-rule",
  "paint-order",
  "vector-effect",
  "marker-start",
  "marker-mid",
  "marker-end",
  "filter",
  "clip-path",
  "mask",
  "flood-color",
  "flood-opacity",
  "lighting-color",
] as const;

/**
 * What else CSS can set on an SVG's elements, which their attributes alone must come to as
 * well for the file to be the SVG the page drew: where each shape lies and how its text is set.
 */
export const SVG_CHECKED = [
  "transform",
  "d",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "width",
  "height",
  "text-decoration",
  "writing-mode",
  "font-variant",
  "font-stretch",
  "word-spacing",
  "baseline-shift",
] as const;

/**
 * An inline SVG as a file of its own: each element's computed paint written onto it as
 * attributes, so a theme's `currentColor`, tokens, and classes survive without the page, at the
 * size it was drawn, and nothing in it that runs. None when the file would draw other than the
 * page did: when it refers to anything outside itself, which a file cannot reach; when the
 * `<svg>` paints a box of its own, or something it is in filters, blends, clips, or masks it,
 * which the PNG keeps; or when CSS set more than its attributes can say, which is found by
 * setting the file's elements where no stylesheet of the page reaches and comparing.
 */
export function pptxSvgInPage(args: {
  node: number;
  paint: readonly string[];
  checked: readonly string[];
}): string | undefined {
  const svg = document.querySelector(`[data-dek-pptx-node="${args.node}"]`);
  if (!(svg instanceof SVGSVGElement) || svg.querySelector("foreignObject")) {
    return undefined;
  }
  const px = (value: string) => Number.parseFloat(value) || 0;
  const none = (value: string) => value === "none" || value === "";
  const own = getComputedStyle(svg);
  // A background color is the file's too, a rectangle under the drawing; any other box paint,
  // or a background with round corners, is the PNG's alone.
  const background = own.backgroundColor === "rgba(0, 0, 0, 0)" ? undefined : own.backgroundColor;
  const round = [
    own.borderTopLeftRadius,
    own.borderTopRightRadius,
    own.borderBottomRightRadius,
    own.borderBottomLeftRadius,
  ].some((radius) => px(radius) > 0);
  if (
    (background !== undefined && round) ||
    !none(own.backgroundImage) ||
    !none(own.boxShadow) ||
    (own.outlineStyle !== "none" && px(own.outlineWidth) > 0) ||
    ["top", "right", "bottom", "left"].some(
      (side) =>
        px(own.getPropertyValue(`border-${side}-width`)) > 0 ||
        px(own.getPropertyValue(`padding-${side}`)) > 0,
    ) ||
    !none(own.transform) ||
    !none(own.scale)
  ) {
    return undefined;
  }
  for (let node: Element | null = svg; node && node.id !== "deck"; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (
      !none(style.filter) ||
      style.mixBlendMode !== "normal" ||
      !none(style.clipPath) ||
      !none(style.maskImage)
    ) {
      return undefined;
    }
  }

  const inside = (id: string) =>
    id === "" || svg.querySelector(`[id="${CSS.escape(id)}"]`) !== null;
  /** A value with every `url()` in it pointing inside the SVG, written `url(#id)`; none if not. */
  const localized = (value: string): string | undefined => {
    let local = true;
    const written = value.replace(
      /url\(\s*(["']?)(.*?)\1\s*\)/g,
      (whole, _quote, target: string) => {
        if (target.startsWith("data:")) {
          return whole;
        }
        if (!target.startsWith("#") || !inside(target.slice(1))) {
          local = false;
        }
        return `url(${target})`;
      },
    );
    return local ? written : undefined;
  };

  const all = [svg, ...svg.querySelectorAll("*")];
  for (const el of all) {
    const href = el.getAttribute("href") ?? el.getAttribute("xlink:href");
    if (
      href !== null &&
      (href.startsWith("#") ? !inside(href.slice(1)) : !href.startsWith("data:"))
    ) {
      return undefined;
    }
  }
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const copies = [copy, ...copy.querySelectorAll("*")];
  // What a `<style>` in the SVG said is in each element's computed paint; a script does not go.
  const pairs = all.flatMap((el, index) => {
    const target = copies[index];
    return target && !el.closest("script, style") ? [[el, target] as const] : [];
  });
  for (const el of copy.querySelectorAll("script, style")) {
    el.remove();
  }
  for (const [el, target] of pairs) {
    for (const name of target.getAttributeNames()) {
      // What the page's CSS said goes in the attributes; inline style would outrank them.
      if (
        /^on/i.test(name) ||
        name.startsWith("data-dek-pptx") ||
        name === "class" ||
        name === "style"
      ) {
        target.removeAttribute(name);
      }
    }
    const style = getComputedStyle(el);
    for (const property of args.paint) {
      const value = style.getPropertyValue(property);
      if (value === "") {
        continue;
      }
      if (/^(filter|clip-path|mask)$/.test(property) && value !== "none" && !/^url\(/.test(value)) {
        return undefined;
      }
      target.setAttribute(property, value);
    }
    for (const name of target.getAttributeNames()) {
      const value = target.getAttribute(name) ?? "";
      if (/url\(/i.test(value)) {
        const local = localized(value);
        if (local === undefined) {
          return undefined;
        }
        target.setAttribute(name, local);
      }
    }
  }
  let opacity = 1;
  for (let node: Element | null = svg; node; node = node.parentElement) {
    opacity *= Number(getComputedStyle(node).opacity);
  }
  const rect = svg.getBoundingClientRect();
  const [width, height] = [px(own.width), px(own.height)];
  if (
    !svg.hasAttribute("viewBox") &&
    (Math.abs(width - rect.width) > 0.5 || Math.abs(height - rect.height) > 0.5)
  ) {
    // Scaled by what it is in: drawn at the size it was laid out, then scaled as the page did.
    if (!(width > 0 && height > 0)) {
      return undefined;
    }
    copy.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", String(rect.width));
  copy.setAttribute("height", String(rect.height));
  copy.setAttribute("opacity", String(opacity));

  const host = document.createElement("div");
  host.setAttribute(
    "style",
    "all: initial; position: fixed; left: 0; top: 0; opacity: 0; pointer-events: none;",
  );
  const probe = copy.cloneNode(true) as SVGSVGElement;
  host.attachShadow({ mode: "closed" }).append(probe);
  document.body.append(host);
  try {
    const probes = [probe, ...probe.querySelectorAll("*")];
    if (probes.length !== pairs.length) {
      return undefined;
    }
    for (const [index, [el]] of pairs.entries()) {
      const page = getComputedStyle(el);
      const file = getComputedStyle(probes[index] as Element);
      for (const property of [...args.paint, ...args.checked]) {
        // The `<svg>` itself is placed and faded by the picture's frame, not by its attributes.
        if (index === 0 && /^(x|y|width|height|transform|opacity)$/.test(property)) {
          continue;
        }
        if (page.getPropertyValue(property) !== file.getPropertyValue(property)) {
          return undefined;
        }
      }
    }
  } finally {
    host.remove();
  }

  // Each color as `rgb()` and an opacity, which every SVG renderer reads, whatever space the
  // page wrote it in: drawn once to be read back in sRGB.
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const paint = canvas.getContext("2d", { willReadFrequently: true });
  const srgb = (value: string): { rgb: string; alpha: number } | undefined => {
    const written = /^rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)$/.exec(
      value,
    );
    if (written) {
      const [, r, g, b, a = "1"] = written;
      return { rgb: `rgb(${r}, ${g}, ${b})`, alpha: Number(a) };
    }
    if (
      !paint ||
      value === "none" ||
      value.includes("url(") ||
      /^(currentcolor|context-)/i.test(value)
    ) {
      return undefined;
    }
    paint.clearRect(0, 0, 1, 1);
    paint.fillStyle = "rgba(0, 0, 0, 0)";
    paint.fillStyle = value;
    paint.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0, a = 0] = paint.getImageData(0, 0, 1, 1).data;
    return { rgb: `rgb(${r}, ${g}, ${b})`, alpha: a / 255 };
  };
  const COLORS: Array<[string, string | undefined]> = [
    ["fill", "fill-opacity"],
    ["stroke", "stroke-opacity"],
    ["stop-color", "stop-opacity"],
    ["flood-color", "flood-opacity"],
    ["lighting-color", undefined],
  ];
  for (const el of [copy, ...copy.querySelectorAll("*")]) {
    for (const [property, opacityOf] of COLORS) {
      const color = srgb(el.getAttribute(property) ?? "none");
      if (!color) {
        continue;
      }
      el.setAttribute(property, color.rgb);
      if (opacityOf && color.alpha < 1) {
        const of = Number(el.getAttribute(opacityOf) ?? "1");
        el.setAttribute(
          opacityOf,
          String(Math.round((Number.isFinite(of) ? of : 1) * color.alpha * 1000) / 1000),
        );
      }
    }
  }

  if (background === undefined) {
    return new XMLSerializer().serializeToString(copy);
  }
  // The drawing in an SVG of the same size, over its background: the drawing keeps its own
  // viewBox, and the rectangle fills the box the page painted.
  const NS = "http://www.w3.org/2000/svg";
  const outer = document.createElementNS(NS, "svg");
  outer.setAttribute("xmlns", NS);
  outer.setAttribute("width", String(rect.width));
  outer.setAttribute("height", String(rect.height));
  outer.setAttribute("opacity", String(opacity));
  const ground = document.createElementNS(NS, "rect");
  ground.setAttribute("width", "100%");
  ground.setAttribute("height", "100%");
  const groundColor = srgb(background);
  ground.setAttribute("fill", groundColor?.rgb ?? background);
  if (groundColor && groundColor.alpha < 1) {
    ground.setAttribute("fill-opacity", String(Math.round(groundColor.alpha * 1000) / 1000));
  }
  copy.removeAttribute("opacity");
  copy.removeAttribute("xmlns");
  copy.setAttribute("x", "0");
  copy.setAttribute("y", "0");
  outer.append(ground, copy);
  return new XMLSerializer().serializeToString(outer);
}

/** The style that shows one element of the slide alone, on nothing; or shows the slide again. */
export function showOnlyPptxNodeInPage(node: number | null): void {
  document.getElementById("dek-pptx-alone")?.remove();
  if (node === null) {
    return;
  }
  const style = document.createElement("style");
  style.id = "dek-pptx-alone";
  const alone = `[data-dek-pptx-node="${node}"]`;
  // Ids no element has, which `:not()` counts, so the rule outranks a theme's own `!important`.
  const over = ":not(#dek-pptx-0):not(#dek-pptx-1):not(#dek-pptx-2)";
  // A transition would draw the change halfway, as it began, in the shot taken next.
  style.textContent = `*, *::before, *::after, *::marker { transition: none !important; }
html${over}, body${over}, #deck${over} { background: transparent !important; }
#deck > .slide${over}, #deck > .slide *:not(${alone}, ${alone} *)${over} { visibility: hidden !important; }
${alone}${over} { visibility: visible !important; }`;
  document.head.append(style);
}

/**
 * Takes what was laid over the picture out of it, with no change to the layout: a shape's
 * background and borders made transparent, a picture hidden, and a bullet's marker unpainted.
 */
export function hidePptxLiftedInPage(lifted: {
  shapes: number[];
  pictures: number[];
  markers: number[];
}): void {
  const over = ":not(#dek-pptx-0):not(#dek-pptx-1):not(#dek-pptx-2)";
  const select = (ids: number[], suffix = "") =>
    ids.map((id) => `[data-dek-pptx-node="${id}"]${over}${suffix}`).join(", ");
  const rules = [
    lifted.shapes.length > 0
      ? `${select(lifted.shapes)} { background-color: transparent !important; border-color: transparent !important; }`
      : "",
    lifted.pictures.length > 0
      ? `${select(lifted.pictures)} { visibility: hidden !important; }`
      : "",
    lifted.markers.length > 0
      ? `${select(lifted.markers, "::marker")} { color: transparent !important; }`
      : "",
  ].filter((rule) => rule !== "");
  if (rules.length === 0) {
    return;
  }
  const style = document.createElement("style");
  // A transition would leave what was lifted halfway gone in the shot taken next.
  style.textContent = [
    "*, *::before, *::after, *::marker { transition: none !important; }",
    ...rules,
  ].join("\n");
  document.head.append(style);
}
