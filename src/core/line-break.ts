/**
 * One run of text as the page breaks it into lines: an element's own text with the text of the
 * inline elements in it, as `<strong>` or `<a>`, which share its lines.
 */
export type TextFlow = {
  /** Its element's index among the slide's elements, as `measureSlideInPage` lists them. */
  element: number;
  /** Its text as written, a `<br>` or a block inside it read as a newline. */
  text: string;
  /** Where each line starts in `text`, and whether a `<br>` or a block started it. */
  lines: Array<{ start: number; forced: boolean }>;
  /** Where each line would start, broken phrase by phrase; only where that is elsewhere. */
  phrased?: number[];
};

/** What `measureTextFlowsInPage` finds: each text with more than one line, and how the slide breaks. */
export type MeasuredFlows = {
  /** The slide's own `word-break`, which every text inherits unless a rule sets its own. */
  wordBreak: string;
  flows: Array<TextFlow & { textWrap: string }>;
};

/**
 * Lays each text on the first `.slide` out in lines, as `TextFlow` says. Where a line ends inside
 * a phrase is what the page itself says: each text whose `word-break` is `normal` is laid out
 * again beside itself with only `word-break: auto-phrase` changed, and where that puts its lines
 * elsewhere, `phrased` says where. Chromium breaks by phrase only where the page's `lang` is one
 * it knows phrases for, such as `ja`, so other text is never laid out elsewhere. The copies are
 * taken away before it returns, so the page is as it was. It runs inside the page through
 * `page.evaluate`, which serializes only this function, so it must not reference anything outside
 * its own body.
 */
export function measureTextFlowsInPage(): MeasuredFlows {
  const slide = document.querySelector(".slide");
  if (!slide) {
    return { wordBreak: "normal", flows: [] };
  }
  // Code keeps its own lines, and a drawing or a formula its own text.
  const code = "pre, code, kbd, samp";
  const drawings = new Set(["svg", "math"]);
  // A text node, whose characters each take their place on a line, or an inline box such as an
  // image or an inline-block, which takes its place whole.
  type Piece = { at: number } & ({ node: Text } | { box: Element });
  type Read = { text: string; pieces: Piece[]; forced: number[] };
  // The text an element lays out in its own lines: its text nodes and those of the inline elements
  // in it, and an inline box as the text it holds, or U+FFFC when it holds none. A <br>, a block
  // between them, or a newline that white-space keeps, as pre-line does, starts a line.
  const read = (root: Element): Read => {
    const found: Read = { text: "", pieces: [], forced: [] };
    const walk = (el: Element) => {
      for (const child of el.childNodes) {
        if (child instanceof Text) {
          const at = found.text.length;
          found.pieces.push({ at, node: child });
          found.text += child.data;
          if (/^(?:pre|pre-wrap|pre-line|break-spaces)$/.test(getComputedStyle(el).whiteSpace)) {
            for (const kept of child.data.matchAll(/\n/g)) {
              found.forced.push(at + kept.index);
            }
          }
          continue;
        }
        if (!(child instanceof Element)) {
          continue;
        }
        const display = getComputedStyle(child).display;
        if (display === "none") {
          continue;
        }
        const tag = child.tagName.toLowerCase();
        if (tag === "br" || (!display.startsWith("inline") && display !== "contents")) {
          found.forced.push(found.text.length);
          found.text += "\n";
        } else if ((display === "inline" || display === "contents") && !drawings.has(tag)) {
          walk(child);
        } else {
          found.pieces.push({ at: found.text.length, box: child });
          found.text += child.textContent?.trim() || "￼";
        }
      }
    };
    walk(root);
    return found;
  };
  // What a piece draws, each with its place in the text: a text node's characters but its white
  // space, which draws nothing of its own, or an inline box whole.
  const drawn = (piece: Piece): Array<{ offset: number; rect: DOMRect }> => {
    if ("box" in piece) {
      return [{ offset: piece.at, rect: piece.box.getBoundingClientRect() }];
    }
    const { node, at } = piece;
    const marks: Array<{ offset: number; rect: DOMRect }> = [];
    for (let end = 0; end < node.data.length; ) {
      const begin = end;
      end += (node.data.codePointAt(begin) ?? 0) > 0xffff ? 2 : 1;
      if (/\s/.test(node.data.slice(begin, end))) {
        continue;
      }
      const range = document.createRange();
      range.setStart(node, begin);
      range.setEnd(node, end);
      marks.push({ offset: at + begin, rect: range.getBoundingClientRect() });
    }
    return marks;
  };
  // Where each line starts: at the first thing drawn below the line before.
  const lineStarts = ({ pieces, forced }: Read): Array<{ start: number; forced: boolean }> => {
    const lines: Array<{ start: number; forced: boolean }> = [];
    let bottom = Number.NEGATIVE_INFINITY;
    let previous = -1;
    for (const { offset, rect } of pieces.flatMap(drawn)) {
      if (rect.width === 0 && rect.height === 0) {
        continue;
      }
      if (rect.top >= bottom - 1) {
        lines.push({
          start: offset,
          forced: lines.length > 0 && forced.some((at) => at > previous && at < offset),
        });
        bottom = rect.bottom;
      } else {
        bottom = Math.max(bottom, rect.bottom);
      }
      previous = offset;
    }
    return lines;
  };

  const all = [...slide.querySelectorAll("*")];
  const measured = all.flatMap((el, element) => {
    const display = getComputedStyle(el).display;
    if (
      !(el instanceof HTMLElement) ||
      display === "inline" ||
      display === "contents" ||
      display === "none" ||
      el.closest(code) !== null ||
      el.closest("svg, math") !== null ||
      el.closest('[aria-hidden="true"]') !== null
    ) {
      return [];
    }
    const flow = read(el);
    const lines = lineStarts(flow);
    if (lines.length < 2) {
      return [];
    }
    const style = getComputedStyle(el);
    const soft = lines.some(({ forced }, at) => at > 0 && !forced);
    return [
      {
        el,
        element,
        flow,
        lines,
        textWrap: style.textWrap,
        rewrap: soft && style.wordBreak === "normal",
      },
    ];
  });
  // Every line is read before any copy goes in, and every copy is in before any is read, so the
  // page is laid out once for each. A copy sits where its text is, out of the flow, with only its
  // word-break changed.
  const copies = measured.map(({ el, rewrap }) => {
    if (!rewrap) {
      return undefined;
    }
    const copy = el.cloneNode(true) as HTMLElement;
    Object.assign(copy.style, {
      position: "absolute",
      visibility: "hidden",
      left: "0px",
      top: "0px",
      margin: "0px",
      boxSizing: "border-box",
      width: `${el.offsetWidth}px`,
      minWidth: "0px",
      maxWidth: "none",
      wordBreak: "auto-phrase",
    });
    el.after(copy);
    return copy;
  });
  const flows = measured.map(({ element, flow, lines, textWrap }, at) => {
    const copy = copies[at];
    const phrased = copy && lineStarts(read(copy)).map(({ start }) => start);
    copy?.remove();
    const moved =
      phrased !== undefined &&
      (phrased.length !== lines.length || phrased.some((start, at) => start !== lines[at]?.start));
    return {
      element,
      text: flow.text,
      lines,
      ...(moved ? { phrased } : {}),
      textWrap,
    };
  });
  return { wordBreak: getComputedStyle(slide).wordBreak, flows };
}

/** What reads wrong about a text's line breaks. */
export type LineBreakKind =
  | {
      /** A line ends inside a phrase. */
      kind: "split";
      /** The lines broken phrase by phrase. */
      phrased: string[];
    }
  | {
      /** A paragraph's last line holds two letters or fewer. */
      kind: "short";
      tail: string;
    };

/** A line break the audience trips over, in the flow of the element at `element`. */
export type LineBreak = {
  element: number;
  /** Its lines as the audience reads them. */
  lines: string[];
} & LineBreakKind;

/** A last line with no more letters or digits than this reads as a remnant. */
const MAX_SHORT = 2;

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** The letters and digits in `text`, an inline box that holds no text counted as one. */
function letters(text: string): number {
  return [...graphemes.segment(text)].filter(({ segment }) => /[\p{L}\p{N}￼]/u.test(segment))
    .length;
}

/** The lines of `text` that start at `starts`, as read: white space collapsed. */
function readLines(text: string, starts: number[]): string[] {
  return starts.map((start, at) =>
    text
      .slice(start, starts[at + 1] ?? text.length)
      .replace(/\s+/g, " ")
      .trim(),
  );
}

/**
 * The line breaks in each flow that read wrong: a line that ends inside a phrase, which `phrased`
 * shows where the page breaks it phrase by phrase, and a paragraph whose last line holds two
 * letters or fewer. A short line a `<br>` or a block starts is the author's, and passes. Where a
 * phrase is broken, every line after it moves once the text breaks by phrase, so that is all a
 * flow reports.
 */
export function findLineBreaks(flows: TextFlow[]): LineBreak[] {
  return flows.flatMap((flow): LineBreak[] => {
    const lines = readLines(
      flow.text,
      flow.lines.map(({ start }) => start),
    );
    if (flow.phrased) {
      return [
        {
          element: flow.element,
          kind: "split",
          lines,
          phrased: readLines(flow.text, flow.phrased),
        },
      ];
    }
    return flow.lines.flatMap(({ forced }, at): LineBreak[] => {
      const last = at === flow.lines.length - 1 || flow.lines[at + 1]?.forced === true;
      const tail = lines[at] ?? "";
      return at > 0 && !forced && last && letters(tail) <= MAX_SHORT
        ? [{ element: flow.element, kind: "short", lines, tail }]
        : [];
    });
  });
}
