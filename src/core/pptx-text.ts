/// <reference lib="dom" />
// What a PPTX takes from a slide as the browser drew it: each line of the text in its HTML flow,
// where it was laid out, character by character, and how it was set, so PowerPoint can set it
// there again; each block's text as it is written, for a shape to set as paragraphs; and the
// slide drawn with that text taken out, as the picture under it.

import type { PaintKey, PptxBlockText, PptxMeasuredBox, PptxMeasuredRun } from "./pptx-plan.ts";
import type { PseudoTextPiece } from "./pseudo-text.ts";
import type { Box } from "./slide-measure.ts";

/**
 * How a text is set as far as its font goes: what a probe is set in to be set in the same font,
 * so the page can be asked which face drew a character, and how wide the character is with the
 * text's own OpenType features and without them.
 */
type PptxFontUse = {
  family: string;
  weight: string;
  style: string;
  stretch: string;
  lang: string;
  /** What PowerPoint does not apply, as declarations: `font-feature-settings`, each `font-variant`. */
  features: string;
  /** What picks the outlines themselves, as declarations: the variation axes. */
  axes: string;
};

export type PptxPageTexts = {
  boxes: PptxMeasuredBox[];
  /** The text of each block a box is in, when it is set in plain lines left to right. */
  blocks: PptxBlockText[];
  /** Text the picture keeps, and the shadows of text it does not, by the element they are of. */
  drawn: Array<{ node: number; extent: Box }>;
  /** The ways the runs are set, which each run names by its place here. */
  uses: PptxFontUse[];
  /** The pseudo-elements whose text is among the boxes, as `<host>::<pseudo>`. */
  pseudos: string[];
};

/** A piece of a pseudo-element's text as Chromium laid it out, and where the pseudo-element paints. */
export type PptxPseudoPiece = PseudoTextPiece & { key: PaintKey };

/**
 * Measures every text in the slide's HTML flow, line by line and character by character, then
 * hides it from the drawing with a highlight, which changes no layout, so a shot taken next is
 * the picture under the text. What is not measured stays drawn: SVG, decoration under
 * `aria-hidden`, what a pseudo-element draws, text a transform rotates or skews, text with no
 * fill of its own, and every text's shadow; the text and the shadows among these are reported as
 * drawn. Each element is known by the number `measurePptxPaintInPage` marked it with, which runs
 * first. Each run says the `font-family` it was set in, for the theme's fonts to be found, and
 * how it is set, for its faces and its characters' widths to be asked for.
 *
 * What `::before` and `::after` write is text too, though the page cannot read it: `pieces` is
 * that text as Chromium laid it out, from `pseudoTextPieces`, and each line of it becomes a box
 * as a line of the HTML's does, set as the pseudo-element's own style says, and is taken out of
 * the drawing. A pseudo-element a transform turns, or with no fill, stays drawn whole.
 *
 * Runs in the page, shipped by `page.evaluate`, so it references nothing outside itself.
 */
export function measurePptxTextsInPage(pieces?: PptxPseudoPiece[]): PptxPageTexts {
  const slide = document.querySelector("#deck > .slide");
  if (!(slide instanceof HTMLElement)) {
    return { boxes: [], blocks: [], drawn: [], uses: [], pseudos: [] };
  }
  /**
   * The element's number, as `measurePptxPaintInPage` marked it; -1 for the slide; and for one it
   * did not mark, which it did not reach or did not run for, a number below -1 of its own, so
   * each owner of text is still told apart.
   */
  const unmarked = new Map<Element, number>();
  const nodeOf = (el: Element): number => {
    const marked = el.getAttribute("data-dek-pptx-node");
    if (marked !== null) {
      return Number(marked);
    }
    if (el === slide) {
      return -1;
    }
    const known = unmarked.get(el) ?? -2 - unmarked.size;
    unmarked.set(el, known);
    return known;
  };
  const origin = slide.getBoundingClientRect();
  const local = (rect: Box): Box => ({
    left: rect.left - origin.left,
    top: rect.top - origin.top,
    right: rect.right - origin.left,
    bottom: rect.bottom - origin.top,
  });
  const drawn: PptxPageTexts["drawn"] = [];

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
      // A value the canvas cannot read leaves its fill as it was: nothing, not the last color.
      paint.fillStyle = "rgba(0, 0, 0, 0)";
      paint.fillStyle = value;
      paint.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0, a = 0] = paint.getImageData(0, 0, 1, 1).data;
      found = { rgb: [r, g, b], alpha: a / 255 };
    }
    colors.set(value, found);
    return found;
  };

  /**
   * How much the element and what it is in, up to the slide, scale it, by `transform` and
   * `scale`; none when one of them rotates or skews it, scales it unevenly, or `zoom` sets it at
   * another size than its computed lengths say, which a text box cannot follow.
   */
  const scaleOf = (el: Element): number | undefined => {
    const set = (value: string) => value !== "none" && value !== "";
    let scale = 1;
    for (
      let node: Element | null = el;
      node && node !== slide.parentElement;
      node = node.parentElement
    ) {
      const style = getComputedStyle(node);
      if (set(style.rotate) || (style.zoom !== "" && Number(style.zoom) !== 1)) {
        return undefined;
      }
      if (set(style.scale)) {
        const [x = Number.NaN, y = x, z = 1] = style.scale.split(/\s+/).map(Number);
        if (!(x > 0) || Math.abs(x - y) > 1e-6 || z !== 1) {
          return undefined;
        }
        scale *= x;
      }
      const transform = style.transform;
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

  /** How far a shadow list reaches past the text: every length in it, added up, at most. */
  const reachOf = (value: string): number =>
    value === "none"
      ? 0
      : (value.match(/-?\d*\.?\d+px/g) ?? []).reduce(
          (sum, length) => sum + Math.abs(Number.parseFloat(length) || 0),
          0,
        );

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

  const uses: PptxFontUse[] = [];
  const useKeys = new Map<string, number>();
  /** The place in `uses` of the way an element's text is set. */
  const useOf = (style: CSSStyleDeclaration, lang: string): number => {
    const declared = (pairs: Array<[string, string]>) =>
      pairs
        .filter(([, value]) => value !== "" && value !== "normal" && value !== "auto")
        .map(([name, value]) => `${name}: ${value};`)
        .join(" ");
    const use: PptxFontUse = {
      family: style.fontFamily,
      weight: style.fontWeight,
      style: style.fontStyle,
      stretch: style.fontStretch,
      lang,
      features: declared([
        ["font-feature-settings", style.fontFeatureSettings],
        ["font-variant-east-asian", style.fontVariantEastAsian],
        ["font-variant-numeric", style.fontVariantNumeric],
        ["font-variant-caps", style.fontVariantCaps],
        ["font-variant-alternates", style.fontVariantAlternates],
        ["font-variant-position", style.fontVariantPosition],
      ]),
      axes: declared([
        ["font-variation-settings", style.fontVariationSettings],
        ["font-optical-sizing", style.fontOpticalSizing],
      ]),
    };
    const key = JSON.stringify(use);
    const known = useKeys.get(key);
    if (known !== undefined) {
      return known;
    }
    useKeys.set(key, uses.length);
    uses.push(use);
    return uses.length - 1;
  };

  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const graphemes = (text: string): number => [...segmenter.segment(text)].length;

  type Fragment = {
    text: string;
    /** Where its first glyph that is not a collapsible space starts. */
    ink: number;
    left: number;
    top: number;
    right: number;
    bottom: number;
    /** Where each grapheme of `text` starts; none when its text is not what was measured. */
    stops: number[] | undefined;
    block: Element;
    run: PptxMeasuredRun;
  };
  const fragments: Fragment[] = [];
  const ranges: Range[] = [];
  /** Each measured text's run, with its white space as written, for its block's paragraph. */
  const written = new Map<
    Text,
    {
      run: PptxMeasuredRun;
      spaces: "collapsed" | "lines" | "kept";
      transform: string;
      lang: string;
    }
  >();

  const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const parent = text.parentElement;
    if (!parent || text.data === "") {
      continue;
    }
    if (parent.closest("svg, script, style, template")) {
      continue;
    }
    const style = getComputedStyle(parent);
    if (style.visibility !== "visible") {
      continue;
    }
    const fill = rgba(style.webkitTextFillColor || style.color);
    const opacity = opacityOf(parent);
    const scale = scaleOf(parent);
    if (opacity === 0) {
      continue;
    }
    const inked = /[^ \t\n\r\f]/.test(text.data);
    // What is not set again stays drawn, and so does every shadow of what is.
    const shadow = reachOf(style.textShadow);
    const kept =
      fill.alpha === 0 || scale === undefined || parent.closest('[aria-hidden="true"]') !== null;
    if (inked && (shadow > 0 || kept)) {
      const whole = document.createRange();
      whole.selectNodeContents(text);
      const bounds = whole.getBoundingClientRect();
      drawn.push({
        node: nodeOf(parent),
        extent: local({
          left: bounds.left - shadow,
          top: bounds.top - shadow,
          right: bounds.right + shadow,
          bottom: bounds.bottom + shadow,
        }),
      });
    }
    if (kept || scale === undefined) {
      continue;
    }
    const block = blockOf(parent);
    const owner = nodeOf(parent);
    const weight = Number(style.fontWeight);
    const letterSpacing =
      style.letterSpacing === "normal" ? 0 : Number.parseFloat(style.letterSpacing);
    const lang = parent.closest("[lang]")?.getAttribute("lang") ?? "";
    const run: PptxMeasuredRun = {
      text: "",
      size: Number.parseFloat(style.fontSize) * scale,
      bold: weight >= 600,
      italic: style.fontStyle !== "normal",
      ...decorationsOf(parent, block),
      color: fill.rgb,
      alpha: Math.round(fill.alpha * opacity * 1000) / 1000,
      letterSpacing: (Number.isFinite(letterSpacing) ? letterSpacing : 0) * scale,
      owner,
      use: useOf(style, lang),
      family: style.fontFamily,
    };
    const collapse = !/^(pre|pre-wrap|break-spaces)$/.test(style.whiteSpace);
    // `pre-line` collapses spaces as `normal` does, and keeps each newline as a break.
    const spaces = !collapse ? "kept" : style.whiteSpace === "pre-line" ? "lines" : "collapsed";

    // The lines the text is drawn on, each the graphemes on it, where each starts, and the box
    // they cover. Text that is only white space is a line too where the browser gave it room: a
    // space between two elements, or an indent that `white-space` keeps.
    const range = document.createRange();
    const lines: Array<{
      text: string;
      ink: number;
      left: number;
      top: number;
      right: number;
      bottom: number;
      stops: number[];
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
      // A tab is as wide as the browser made it, which a space set that wide says again.
      const glyph = space && (collapse || segment === "\t") ? " " : segment;
      const line = lines.at(-1);
      const sameLine =
        line !== undefined &&
        rect.top < line.bottom - (line.bottom - line.top) / 2 &&
        rect.left >= line.right - Math.max(2, run.size / 2);
      if (sameLine) {
        if (!(collapse && glyph === " " && line.text.endsWith(" "))) {
          line.text += glyph;
          line.stops.push(rect.left);
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
          stops: [rect.left],
        });
      }
    }
    if (lines.length === 0) {
      // A line break that `white-space` keeps is drawn as nothing and still breaks the line: it
      // is part of what its block says, though no line of it was measured.
      if (spaces !== "collapsed" && text.data.includes("\n") && !/flex|grid/.test(style.display)) {
        written.set(text, { run, spaces, transform: style.textTransform, lang });
      }
      continue;
    }
    written.set(text, { run, spaces, transform: style.textTransform, lang });
    const all = document.createRange();
    all.selectNodeContents(text);
    ranges.push(all);
    for (const line of lines) {
      const set = transformText(line.text, style.textTransform, lang);
      fragments.push({
        ...line,
        text: set,
        // A transform that changes how many characters there are, as ß to SS does, leaves no
        // place for each.
        stops: graphemes(set) === line.stops.length ? line.stops : undefined,
        block,
        run,
      });
    }
  }

  // Pieces of one line in one block that sit together are one box, a run each; a gap wider than
  // a space, such as the padding of a chip, starts another.
  type Open = {
    box: PptxMeasuredBox;
    block: Element;
    right: number;
    /** Whether a glyph that is not white space has been put in it. */
    inked: boolean;
    stops: number[] | undefined;
  };
  const opened: Open[] = [];
  let open: Open | undefined;
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
      // A box starts at its first glyph: the spaces before it are not set.
      const left =
        open.inked || !Number.isFinite(fragment.ink)
          ? Math.min(box.x + origin.left, fragment.left)
          : fragment.ink;
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
      open.inked ||= Number.isFinite(fragment.ink);
      if (open.stops && fragment.stops) {
        open.stops.push(...fragment.stops);
      } else {
        open.stops = undefined;
      }
      continue;
    }
    const start = Number.isFinite(fragment.ink) ? fragment.ink : fragment.left;
    const box: PptxMeasuredBox = {
      block: nodeOf(fragment.block),
      x: start - origin.left,
      y: fragment.top - origin.top,
      width: Math.max(0, fragment.right - start),
      height,
      lineHeight: height,
      runs: [{ ...fragment.run, text: fragment.text }],
    };
    open = {
      box,
      block: fragment.block,
      right: fragment.right,
      inked: Number.isFinite(fragment.ink),
      stops: fragment.stops ? [...fragment.stops] : undefined,
    };
    opened.push(open);
  }
  const boxes: PptxMeasuredBox[] = [];
  for (const { box, stops, right } of opened) {
    // The white space a box starts and ends with is not set, whichever run it is in.
    let before = 0;
    let after = 0;
    for (;;) {
      const first = box.runs[0];
      if (!first) {
        break;
      }
      const trimmed = first.text.replace(/^[ \t\n\r\f]+/, "");
      before += graphemes(first.text) - graphemes(trimmed);
      first.text = trimmed;
      if (trimmed !== "") {
        break;
      }
      box.runs.shift();
    }
    for (;;) {
      const last = box.runs.at(-1);
      if (!last) {
        break;
      }
      const trimmed = last.text.replace(/[ \t\n\r\f]+$/, "");
      after += graphemes(last.text) - graphemes(trimmed);
      last.text = trimmed;
      if (trimmed !== "") {
        break;
      }
      box.runs.pop();
    }
    if (box.runs.length === 0) {
      continue;
    }
    const count = box.runs.reduce((sum, each) => sum + graphemes(each.text), 0);
    if (stops && stops.length === before + count + after) {
      // Where each character it keeps starts, and where the last ends: at the first space taken
      // from its end, or where the line ended.
      const end = after > 0 ? (stops[before + count] ?? right) : right;
      box.stops = [...stops.slice(before, before + count), end].map((x) => x - origin.left);
      const [first = box.x] = box.stops;
      box.width = Math.max(0, end - origin.left - first);
      box.x = first;
    }
    boxes.push(box);
  }

  // What the pseudo-elements write, a line a box, each line's characters placed by setting the
  // same text the same way out of the slide, where the page can measure it.
  const pseudos: string[] = [];
  const unseen: string[] = [];
  const byPseudo = new Map<string, PptxPseudoPiece[]>();
  for (const piece of pieces ?? []) {
    const name = `${piece.host}::${piece.pseudo}`;
    byPseudo.set(name, [...(byPseudo.get(name) ?? []), piece]);
  }
  let fresh = 0;
  for (const [name, parts] of byPseudo) {
    const [first] = parts;
    const host =
      first === undefined
        ? null
        : slide.matches(`[data-dek-pptx-pseudo="${first.host}"]`)
          ? slide
          : slide.querySelector(`[data-dek-pptx-pseudo="${first.host}"]`);
    if (!first || !host) {
      continue;
    }
    const style = getComputedStyle(host, `::${first.pseudo}`);
    const fill = rgba(style.webkitTextFillColor || style.color);
    const opacity = opacityOf(host) * Number(style.opacity);
    const scale = scaleOf(host);
    const set = (value: string) => value !== "none" && value !== "";
    if (
      style.visibility !== "visible" ||
      opacity === 0 ||
      fill.alpha === 0 ||
      scale === undefined ||
      set(style.transform) ||
      set(style.rotate) ||
      set(style.scale) ||
      style.writingMode !== "horizontal-tb" ||
      style.direction !== "ltr" ||
      host.closest('[aria-hidden="true"]') !== null
    ) {
      continue;
    }
    const lang = host.closest("[lang]")?.getAttribute("lang") ?? "";
    const weight = Number(style.fontWeight);
    const letterSpacing =
      style.letterSpacing === "normal" ? 0 : Number.parseFloat(style.letterSpacing);
    const run: PptxMeasuredRun = {
      text: "",
      size: Number.parseFloat(style.fontSize) * scale,
      bold: weight >= 600,
      italic: style.fontStyle !== "normal",
      underline: style.textDecorationLine.includes("underline"),
      strike: style.textDecorationLine.includes("line-through"),
      color: fill.rgb,
      alpha: Math.round(fill.alpha * opacity * 1000) / 1000,
      letterSpacing: (Number.isFinite(letterSpacing) ? letterSpacing : 0) * scale,
      owner: nodeOf(host),
      use: useOf(style, lang),
      family: style.fontFamily,
      key: first.key,
    };
    const lines: Array<{ text: string; left: number; top: number; right: number; bottom: number }> =
      [];
    for (const part of parts) {
      const middle = part.y + part.height / 2;
      const line = lines.find((each) => middle > each.top && middle < each.bottom);
      if (line) {
        line.text += part.text;
        line.left = Math.min(line.left, part.x);
        line.right = Math.max(line.right, part.x + part.width);
        line.top = Math.min(line.top, part.y);
        line.bottom = Math.max(line.bottom, part.y + part.height);
      } else {
        lines.push({
          text: part.text,
          left: part.x,
          top: part.y,
          right: part.x + part.width,
          bottom: part.y + part.height,
        });
      }
    }
    for (const line of lines) {
      const text = transformText(line.text.replace(/[\t\n\r\f]/g, " "), style.textTransform, lang);
      const before = graphemes(text) - graphemes(text.replace(/^ +/, ""));
      const after = graphemes(text) - graphemes(text.replace(/ +$/, ""));
      const kept = text.trim();
      if (kept === "") {
        continue;
      }
      // The same text set the same way where the page can measure each character of it.
      const probe = document.createElement("span");
      probe.style.cssText = `position: absolute; left: 0; top: 0; visibility: hidden; white-space: pre; font: ${style.font}; letter-spacing: ${style.letterSpacing}; word-spacing: ${style.wordSpacing}; font-feature-settings: ${style.fontFeatureSettings}; font-variant: ${style.fontVariant}; font-kerning: ${style.fontKerning}; font-variation-settings: ${style.fontVariationSettings};`;
      probe.style.fontFamily = style.fontFamily;
      probe.style.fontSize = style.fontSize;
      probe.style.fontWeight = style.fontWeight;
      probe.style.fontStyle = style.fontStyle;
      probe.style.fontStretch = style.fontStretch;
      if (lang !== "") {
        probe.setAttribute("lang", lang);
      }
      probe.textContent = text;
      document.body.append(probe);
      const range = document.createRange();
      const lefts: number[] = [];
      let index = 0;
      for (const { segment } of segmenter.segment(text)) {
        if (probe.firstChild) {
          range.setStart(probe.firstChild, index);
          range.setEnd(probe.firstChild, index + segment.length);
          lefts.push(range.getBoundingClientRect().left);
        }
        index += segment.length;
      }
      const whole = probe.getBoundingClientRect();
      probe.remove();
      const drawn = (line.right - line.left) / scale;
      const placed = lefts.length === graphemes(text) && Math.abs(whole.width - drawn) <= 1;
      const at = (edge: number) => line.left + (edge - whole.left) * scale - origin.left;
      const stops = placed
        ? [
            ...lefts.slice(before, lefts.length - after).map(at),
            at(after > 0 ? (lefts[lefts.length - after] ?? whole.right) : whole.right),
          ]
        : undefined;
      const x = stops?.[0] ?? line.left - origin.left;
      const end = stops?.at(-1) ?? line.right - origin.left;
      boxes.push({
        block: -100000 - fresh++,
        x,
        y: line.top - origin.top,
        width: Math.max(0, end - x),
        height: line.bottom - line.top,
        lineHeight: line.bottom - line.top,
        runs: [{ ...run, text: kept }],
        ...(stops ? { stops } : {}),
      });
    }
    pseudos.push(name);
    unseen.push(`[data-dek-pptx-pseudo="${first.host}"]::${first.pseudo}`);
  }

  const style = document.createElement("style");
  style.textContent = `::highlight(dek-pptx) { color: transparent; -webkit-text-fill-color: transparent; text-decoration-color: transparent; }${
    unseen.length > 0
      ? ` ${unseen.join(", ")} { -webkit-text-fill-color: transparent !important; text-decoration-color: transparent !important; transition: none !important; }`
      : ""
  }`;
  document.head.append(style);
  CSS.highlights.set("dek-pptx", new Highlight(...ranges));

  const blocks = [...new Set(fragments.map((fragment) => fragment.block))].flatMap(
    (block): PptxBlockText[] => {
      const text = paragraphOf(block);
      return text ? [text] : [];
    },
  );
  return { boxes, blocks, drawn, uses, pseudos };

  /**
   * A block's text as it is written, in runs, a `<br>` as a line break; none when it is not set
   * in plain lines left to right, which a paragraph could not set again.
   */
  function paragraphOf(block: Element): PptxBlockText | undefined {
    const style = getComputedStyle(block);
    if (style.writingMode !== "horizontal-tb" || style.direction !== "ltr") {
      return undefined;
    }
    const runs: PptxMeasuredRun[] = [];
    const walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      if (node instanceof HTMLBRElement && blockOf(node) === block) {
        const last = runs.at(-1);
        if (last) {
          last.text = `${last.text.replace(/ +$/, "")}\n`;
        }
        continue;
      }
      const facts = node instanceof Text ? written.get(node) : undefined;
      if (
        !facts ||
        !(node instanceof Text) ||
        node.parentElement === null ||
        blockOf(node.parentElement) !== block
      ) {
        continue;
      }
      let piece =
        facts.spaces === "collapsed"
          ? node.data.replace(/[ \t\n\r\f]+/g, " ")
          : facts.spaces === "lines"
            ? node.data.replace(/[ \t\r\f]*\n[ \t\r\f]*/g, "\n").replace(/[ \t\r\f]+/g, " ")
            : node.data.replace(/\t/g, " ");
      const before = runs.at(-1)?.text ?? "";
      if (facts.spaces !== "kept" && (before === "" || / $|\n$/.test(before))) {
        piece = piece.replace(/^ /, "");
      }
      piece = transformText(piece, facts.transform, facts.lang);
      const last = runs.at(-1);
      if (last && sameStyle(last, facts.run)) {
        last.text += piece;
      } else if (piece !== "") {
        runs.push({ ...facts.run, text: piece });
      }
    }
    const last = runs.at(-1);
    if (last) {
      last.text = last.text.replace(/[ \t\n\r\f]+$/, "");
    }
    const kept = runs.filter((run) => run.text !== "");
    if (kept.length === 0 || !kept.some((run) => /[^ \t\n\r\f]/.test(run.text))) {
      return undefined;
    }
    const rect = block.getBoundingClientRect();
    const scale = scaleOf(block) ?? 1;
    const px = (value: string) => (Number.parseFloat(value) || 0) * scale;
    const align = style.textAlign;
    const level = /^H[1-6]$/.test(block.tagName)
      ? Number(block.tagName.slice(1))
      : block.getAttribute("role") === "heading"
        ? Number(block.getAttribute("aria-level")) || 2
        : undefined;
    // A list's items that are blocks of text themselves read as one text, an item a paragraph.
    const list =
      block.tagName === "LI" && block.parentElement && /^(UL|OL)$/.test(block.parentElement.tagName)
        ? nodeOf(block.parentElement)
        : undefined;
    return {
      node: nodeOf(block),
      runs: kept,
      align: /center/.test(align)
        ? "center"
        : align === "right" || align === "end"
          ? "right"
          : align === "justify"
            ? "justify"
            : "left",
      lineHeight: Number.parseFloat(style.lineHeight) * scale,
      content: local({
        left: rect.left + px(style.borderLeftWidth) + px(style.paddingLeft),
        top: rect.top + px(style.borderTopWidth) + px(style.paddingTop),
        right: rect.right - px(style.borderRightWidth) - px(style.paddingRight),
        bottom: rect.bottom - px(style.borderBottomWidth) - px(style.paddingBottom),
      }),
      textIndent: px(style.textIndent),
      ...(level === undefined ? {} : { heading: level }),
      ...(list === undefined ? {} : { list }),
    };
  }

  function sameStyle(a: PptxMeasuredRun, b: PptxMeasuredRun): boolean {
    return (
      a.owner === b.owner &&
      a.use === b.use &&
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

/** Characters set one way at one size, whose widths are asked for. */
export type PptxGlyphRequest = { use: PptxFontUse; size: number; graphemes: string[] };

/**
 * How wide each character is alone, in pixels: `natural` with no OpenType feature, kerning, or
 * spacing, as PowerPoint sets it, and `featured` with the features the text itself is set with.
 */
export type PptxGlyphWidths = { natural: number[]; featured: number[] };

/**
 * Measures each request's characters, each alone in the request's font at its size, on a line
 * of its own out of the slide, and takes the lines away again.
 *
 * Runs in the page, shipped by `page.evaluate`, so it references nothing outside itself.
 */
export function measurePptxGlyphsInPage(requests: PptxGlyphRequest[]): PptxGlyphWidths[] {
  const host = document.createElement("div");
  host.style.cssText =
    "position: absolute; left: 0; top: 0; visibility: hidden; pointer-events: none; white-space: pre;";
  const rows = requests.map(({ use, size, graphemes }) => {
    const row = (features: string): HTMLElement => {
      const line = document.createElement("div");
      if (use.lang !== "") {
        line.setAttribute("lang", use.lang);
      }
      line.style.cssText = `font-weight: ${use.weight}; font-style: ${use.style}; font-stretch: ${use.stretch}; font-size: ${size}px; line-height: 1; letter-spacing: 0; word-spacing: 0; text-transform: none; text-indent: 0; font-kerning: none; text-spacing-trim: space-all; ${use.axes} ${features}`;
      line.style.fontFamily = use.family;
      for (const grapheme of graphemes) {
        const cell = document.createElement("span");
        cell.style.display = "inline-block";
        cell.textContent = grapheme;
        line.append(cell);
      }
      host.append(line);
      return line;
    };
    return {
      natural: row("font-feature-settings: normal; font-variant: normal;"),
      featured: row(use.features),
    };
  });
  document.body.append(host);
  const widths = (line: HTMLElement): number[] =>
    [...line.children].map((cell) => cell.getBoundingClientRect().width);
  const measured = rows.map(({ natural, featured }) => ({
    natural: widths(natural),
    featured: widths(featured),
  }));
  host.remove();
  return measured;
}

/** A line's runs as the file gives them to PowerPoint: how each is set, its size, and its text. */
export type PptxPlainLine = Array<{ use: PptxFontUse; size: number; text: string }>;

/**
 * Sets each line again as PowerPoint will: in the same fonts at the same sizes, with none of the
 * text's own OpenType features, no letter spacing, and no trimming of punctuation, kerned as its
 * font says. Answers where each character of each line starts, from the line's start, and where
 * its last ends: one more number than the line has characters, and none for a line with no runs.
 *
 * Runs in the page, shipped by `page.evaluate`, so it references nothing outside itself.
 */
export function measurePptxPlainLinesInPage(lines: PptxPlainLine[]): number[][] {
  const host = document.createElement("div");
  host.style.cssText =
    "position: absolute; left: 0; top: 0; visibility: hidden; pointer-events: none; white-space: pre;";
  const rows = lines.map((runs) => {
    const row = document.createElement("div");
    for (const { use, size, text } of runs) {
      const span = document.createElement("span");
      if (use.lang !== "") {
        span.setAttribute("lang", use.lang);
      }
      span.style.cssText = `font-weight: ${use.weight}; font-style: ${use.style}; font-stretch: ${use.stretch}; font-size: ${size}px; letter-spacing: 0; word-spacing: 0; text-transform: none; text-spacing-trim: space-all; font-feature-settings: normal; font-variant: normal; ${use.axes}`;
      span.style.fontFamily = use.family;
      span.textContent = text;
      row.append(span);
    }
    host.append(row);
    return row;
  });
  document.body.append(host);
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const range = document.createRange();
  const measured = rows.map((row) => {
    const stops: number[] = [];
    let end = 0;
    const start = row.getBoundingClientRect().left;
    for (const span of row.children) {
      const text = span.firstChild;
      if (!(text instanceof Text)) {
        continue;
      }
      for (const { segment, index } of segmenter.segment(text.data)) {
        range.setStart(text, index);
        range.setEnd(text, index + segment.length);
        const rect = range.getBoundingClientRect();
        stops.push(rect.left - start);
        end = rect.right - start;
      }
    }
    return stops.length > 0 ? [...stops, end] : [];
  });
  host.remove();
  return measured;
}

/**
 * A text set one way, marked for Chromium to say which face drew it; with `local`, set in the
 * face that name alone finds, whatever family the use says.
 */
export type PptxFaceProbe = { id: string; use: PptxFontUse; text: string; local?: string };

/** The attribute that marks each probe put in the page to ask for its face. */
export const PPTX_FACE_ATTR = "data-dek-pptx-face";

/**
 * Puts each probe's text in the page, out of the slide, set as the probe says and marked with
 * its id, or with nothing takes the probes away. They are laid out and drawn once, so Chromium
 * has shaped them with the faces it found; the slide is shot only once they are gone.
 *
 * Runs in the page, shipped by `page.evaluate`, so it references nothing outside itself.
 */
export async function pptxFaceProbesInPage(probes: PptxFaceProbe[] | null): Promise<void> {
  document.querySelector("[data-dek-pptx-faces]")?.remove();
  if (!probes) {
    return;
  }
  const host = document.createElement("div");
  host.setAttribute("data-dek-pptx-faces", "");
  host.style.cssText = "position: absolute; left: 0; top: 0; white-space: pre;";
  // A name is asked for through a family of one face, the one `local()` finds by it: a full
  // name or the font file's own, as a renderer that is given the name looks it up.
  const rules: string[] = [];
  for (const { id, use, text, local } of probes) {
    const probe = document.createElement("div");
    probe.setAttribute("data-dek-pptx-face", id);
    if (use.lang !== "") {
      probe.setAttribute("lang", use.lang);
    }
    if (local === undefined) {
      probe.style.cssText = `font-weight: ${use.weight}; font-style: ${use.style}; font-stretch: ${use.stretch}; font-size: 16px; text-transform: none; ${use.axes} ${use.features}`;
      probe.style.fontFamily = use.family;
    } else {
      const family = `dek-pptx-face-${rules.length}`;
      rules.push(
        `@font-face { font-family: "${family}"; src: local("${local.replace(/["\\\n]/g, "\\$&")}"); }`,
      );
      probe.style.cssText = `font-family: "${family}"; font-weight: 400; font-style: normal; font-size: 16px; text-transform: none;`;
    }
    probe.textContent = text;
    host.append(probe);
  }
  if (rules.length > 0) {
    const style = document.createElement("style");
    style.textContent = rules.join("\n");
    host.prepend(style);
  }
  document.body.append(host);
  await document.fonts.ready;
  await new Promise<void>((done) =>
    requestAnimationFrame(() => requestAnimationFrame(() => done())),
  );
}
