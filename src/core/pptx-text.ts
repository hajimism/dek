/// <reference lib="dom" />
// What a PPTX takes from a slide as the browser drew it: each line of the text in its HTML flow,
// where it was laid out and how it was set, so PowerPoint can set it there again; and the slide
// drawn with that text taken out, as the picture under it.

import type { PptxRun, PptxTextBox } from "./pptx-package.ts";

/** A run as the page measures it: the element that owns its text, for its font to be looked up. */
type MeasuredRun = Omit<PptxRun, "font"> & { owner: number };

type MeasuredBox = Omit<PptxTextBox, "runs"> & { runs: MeasuredRun[] };

export type PptxPageTexts = {
  boxes: MeasuredBox[];
  /** How many elements own text, marked `data-dek-pptx-font="<n>"` for their fonts. */
  owners: number;
  /** The alternative texts the slide's pictures carry, for the slide's picture as a whole. */
  description: string;
};

/** The attribute that marks each element owning measured text, by its number. */
export const PPTX_OWNER_ATTR = "data-dek-pptx-font";

/**
 * Measures every text in the slide's HTML flow, line by line, then hides it from the drawing with
 * a highlight, which changes no layout, so a shot taken next is the picture under the text. What
 * is not measured stays drawn: SVG, decoration under `aria-hidden`, what a pseudo-element draws,
 * text a transform rotates or skews, text with no fill of its own, and every text's shadow.
 *
 * Runs in the page, shipped by `page.evaluate`, so it references nothing outside itself.
 */
export function measurePptxTextsInPage(): PptxPageTexts {
  const slide = document.querySelector("#deck > .slide");
  if (!(slide instanceof HTMLElement)) {
    return { boxes: [], owners: 0, description: "" };
  }
  const origin = slide.getBoundingClientRect();

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const paint = canvas.getContext("2d", { willReadFrequently: true });
  const colors = new Map<string, { rgb: [number, number, number]; alpha: number }>();
  /** A computed color as sRGB, whatever space it is written in, by drawing it. */
  const rgba = (value: string): { rgb: [number, number, number]; alpha: number } => {
    const known = colors.get(value);
    if (known) {
      return known;
    }
    let found = { rgb: [0, 0, 0] as [number, number, number], alpha: 0 };
    if (paint) {
      paint.clearRect(0, 0, 1, 1);
      paint.fillStyle = value;
      paint.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0, a = 0] = paint.getImageData(0, 0, 1, 1).data;
      found = { rgb: [r, g, b], alpha: a / 255 };
    }
    colors.set(value, found);
    return found;
  };

  /**
   * How much the element and what it is in, up to the slide, scale it; none when one of them
   * rotates or skews it, or scales it unevenly, which a text box cannot follow.
   */
  const scaleOf = (el: Element): number | undefined => {
    let scale = 1;
    for (
      let node: Element | null = el;
      node && node !== slide.parentElement;
      node = node.parentElement
    ) {
      const transform = getComputedStyle(node).transform;
      if (transform === "none" || transform === "") {
        continue;
      }
      const matrix = new DOMMatrixReadOnly(transform);
      if (!matrix.is2D || Math.abs(matrix.b) > 1e-6 || Math.abs(matrix.c) > 1e-6) {
        return undefined;
      }
      if (Math.abs(matrix.a - matrix.d) > 1e-6 || matrix.a <= 0) {
        return undefined;
      }
      scale *= matrix.a;
    }
    return scale;
  };

  const opacityOf = (el: Element): number => {
    let opacity = 1;
    for (
      let node: Element | null = el;
      node && node !== slide.parentElement;
      node = node.parentElement
    ) {
      opacity *= Number(getComputedStyle(node).opacity);
    }
    return opacity;
  };

  /** The nearest element around `el` laid out as a block of its own, `el` included. */
  const blockOf = (el: Element): Element => {
    for (let node: Element | null = el; node; node = node.parentElement) {
      const display = getComputedStyle(node).display;
      if (node === slide || (display !== "inline" && display !== "contents")) {
        return node;
      }
    }
    return slide;
  };

  /** The decorations an element's text is drawn with: its own, and its inline ancestors' up to its block. */
  const decorationsOf = (el: Element, block: Element): { underline: boolean; strike: boolean } => {
    let underline = false;
    let strike = false;
    for (let node: Element | null = el; node; node = node.parentElement) {
      const line = getComputedStyle(node).textDecorationLine;
      underline ||= line.includes("underline");
      strike ||= line.includes("line-through");
      if (node === block) {
        break;
      }
    }
    return { underline, strike };
  };

  const transformText = (text: string, transform: string, lang: string): string => {
    if (transform === "uppercase") {
      return text.toLocaleUpperCase(lang || undefined);
    }
    if (transform === "lowercase") {
      return text.toLocaleLowerCase(lang || undefined);
    }
    if (transform === "capitalize") {
      return text.replace(
        /(^|\s)(\p{L})/gu,
        (_, space: string, letter: string) =>
          `${space}${letter.toLocaleUpperCase(lang || undefined)}`,
      );
    }
    return text;
  };

  type Fragment = {
    text: string;
    /** Where its first glyph that is not a collapsible space starts. */
    ink: number;
    left: number;
    top: number;
    right: number;
    bottom: number;
    block: Element;
    run: MeasuredRun;
  };
  const fragments: Fragment[] = [];
  const ranges: Range[] = [];
  const owners = new Map<Element, number>();
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

  const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const parent = text.parentElement;
    if (!parent || !/[^ \t\n\r\f]/.test(text.data)) {
      continue;
    }
    if (parent.closest('svg, script, style, template, [aria-hidden="true"]')) {
      continue;
    }
    const style = getComputedStyle(parent);
    if (style.visibility !== "visible") {
      continue;
    }
    const fill = rgba(style.webkitTextFillColor || style.color);
    const opacity = opacityOf(parent);
    const scale = scaleOf(parent);
    if (fill.alpha === 0 || opacity === 0 || scale === undefined) {
      continue;
    }
    const block = blockOf(parent);
    const owner = owners.get(parent) ?? owners.size;
    owners.set(parent, owner);
    const weight = Number(style.fontWeight);
    const letterSpacing =
      style.letterSpacing === "normal" ? 0 : Number.parseFloat(style.letterSpacing);
    const run: MeasuredRun = {
      text: "",
      size: Number.parseFloat(style.fontSize) * scale,
      bold: weight >= 600,
      italic: style.fontStyle !== "normal",
      ...decorationsOf(parent, block),
      color: fill.rgb,
      alpha: Math.round(fill.alpha * opacity * 1000) / 1000,
      letterSpacing: (Number.isFinite(letterSpacing) ? letterSpacing : 0) * scale,
      owner,
    };
    const collapse = !/^(pre|pre-wrap|break-spaces)$/.test(style.whiteSpace);
    const lang = parent.closest("[lang]")?.getAttribute("lang") ?? "";

    // The lines the text is drawn on, each the graphemes on it and the box they cover.
    const range = document.createRange();
    const lines: Array<{
      text: string;
      ink: number;
      left: number;
      top: number;
      right: number;
      bottom: number;
    }> = [];
    for (const { segment, index } of segmenter.segment(text.data)) {
      range.setStart(text, index);
      range.setEnd(text, index + segment.length);
      const rect = [...range.getClientRects()].find((box) => box.width > 0 || box.height > 0);
      // Only the white space CSS collapses; an ideographic space is a character like any other.
      const space = /^[ \t\n\r\f]+$/.test(segment);
      if (!rect || (space && rect.width === 0)) {
        continue;
      }
      const glyph = space && collapse ? " " : segment;
      const line = lines.at(-1);
      const sameLine =
        line !== undefined &&
        rect.top < line.bottom - (line.bottom - line.top) / 2 &&
        rect.left >= line.right - Math.max(2, run.size / 2);
      if (sameLine) {
        if (!(collapse && glyph === " " && line.text.endsWith(" "))) {
          line.text += glyph;
        }
        if (!space && line.ink === Number.POSITIVE_INFINITY) {
          line.ink = rect.left;
        }
        line.left = Math.min(line.left, rect.left);
        line.top = Math.min(line.top, rect.top);
        line.right = Math.max(line.right, rect.right);
        line.bottom = Math.max(line.bottom, rect.bottom);
      } else {
        lines.push({
          text: glyph,
          ink: space ? Number.POSITIVE_INFINITY : rect.left,
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        });
      }
    }
    if (lines.length === 0) {
      continue;
    }
    const all = document.createRange();
    all.selectNodeContents(text);
    ranges.push(all);
    for (const line of lines) {
      fragments.push({
        ...line,
        text: transformText(line.text, style.textTransform, lang),
        block,
        run,
      });
    }
  }

  // Pieces of one line in one block that sit together are one box, a run each; a gap wider than
  // a space, such as the padding of a chip, starts another.
  const boxes: MeasuredBox[] = [];
  let open: { box: MeasuredBox; block: Element; right: number } | undefined;
  for (const fragment of fragments) {
    const height = fragment.bottom - fragment.top;
    const gap = open ? fragment.left - open.right : Number.POSITIVE_INFINITY;
    const joins =
      open !== undefined &&
      open.block === fragment.block &&
      Math.abs(fragment.top - open.box.y - origin.top) < height / 2 &&
      gap > -fragment.run.size / 2 &&
      gap <= fragment.run.size * 0.3;
    if (open && joins) {
      const { box } = open;
      const left = Math.min(box.x + origin.left, fragment.left);
      const top = Math.min(box.y + origin.top, fragment.top);
      const right = Math.max(box.x + origin.left + box.width, fragment.right);
      const bottom = Math.max(box.y + origin.top + box.height, fragment.bottom);
      Object.assign(box, {
        x: left - origin.left,
        y: top - origin.top,
        width: right - left,
        height: bottom - top,
        lineHeight: Math.max(box.lineHeight, height),
      });
      const last = box.runs.at(-1);
      if (last && sameStyle(last, fragment.run)) {
        last.text += fragment.text;
      } else {
        box.runs.push({ ...fragment.run, text: fragment.text });
      }
      open.right = fragment.right;
      continue;
    }
    // A box starts at its first glyph: a space it would start with is not set.
    const start = Number.isFinite(fragment.ink) ? fragment.ink : fragment.left;
    const box: MeasuredBox = {
      x: start - origin.left,
      y: fragment.top - origin.top,
      width: Math.max(0, fragment.right - start),
      height,
      lineHeight: height,
      runs: [{ ...fragment.run, text: fragment.text }],
    };
    boxes.push(box);
    open = { box, block: fragment.block, right: fragment.right };
  }
  for (const box of boxes) {
    const first = box.runs[0];
    const last = box.runs.at(-1);
    if (first) {
      first.text = first.text.replace(/^[ \t\n\r\f]+/, "");
    }
    if (last) {
      last.text = last.text.replace(/[ \t\n\r\f]+$/, "");
    }
    box.runs = box.runs.filter((run) => run.text !== "");
  }

  for (const [el, owner] of owners) {
    el.setAttribute("data-dek-pptx-font", String(owner));
  }
  const style = document.createElement("style");
  style.textContent =
    "::highlight(dek-pptx) { color: transparent; -webkit-text-fill-color: transparent; text-decoration-color: transparent; }";
  document.head.append(style);
  CSS.highlights.set("dek-pptx", new Highlight(...ranges));

  const described = [...slide.querySelectorAll("img[alt], [aria-label], svg > title")].flatMap(
    (el) => {
      if (el.closest('[aria-hidden="true"]')) {
        return [];
      }
      const said =
        (el.tagName.toLowerCase() === "title"
          ? el.textContent
          : (el.getAttribute("alt") ?? el.getAttribute("aria-label"))) ?? "";
      return said.trim() === "" ? [] : [said.trim()];
    },
  );
  return {
    boxes: boxes.filter((box) => box.runs.length > 0),
    owners: owners.size,
    description: described.join(" / "),
  };

  function sameStyle(a: MeasuredRun, b: MeasuredRun): boolean {
    return (
      a.owner === b.owner &&
      a.size === b.size &&
      a.bold === b.bold &&
      a.italic === b.italic &&
      a.underline === b.underline &&
      a.strike === b.strike &&
      a.alpha === b.alpha &&
      a.letterSpacing === b.letterSpacing &&
      a.color.join() === b.color.join()
    );
  }
}
