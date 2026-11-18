/// <reference lib="dom" />
import type { Page } from "playwright";

// What a slide shows as the browser drew it, counted apart from the exporter: every line of text,
// its own and its pseudo-elements', and the slide shot with and without that text.

/** A line of text on the slide, in the slide's own pixels. */
type CensusLine = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** Its characters, white space left out. */
  chars: number;
  kind: "html" | "pseudo" | "decoration";
  /** Whether it holds East Asian characters, and whether it holds any others. */
  eastAsian: boolean;
  other: boolean;
};

/** Kana, ideographs, and the full-width forms and punctuation set with them. */
const EAST_ASIAN = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/u;

/** A block's text, white space left out, and the lines the browser set it in. */
type CensusBlock = { ink: string; lines: number };

export type SlideCensus = {
  lines: CensusLine[];
  /** The blocks of text that is not decoration, in document order. */
  blocks: CensusBlock[];
  /**
   * Characters the slide shows, white space left out: in its HTML, drawn by `::before` and
   * `::after`, and under `aria-hidden`, which says it is decoration.
   */
  chars: { html: number; pseudo: number; decoration: number };
  /** Links with text to follow. */
  links: number;
  /** Whether the slide has a heading. */
  heading: boolean;
};

type PageCensus = Omit<SlideCensus, "chars"> & {
  chars: { html: number; decoration: number };
  origin: { left: number; top: number };
};

/** Runs in the page, shipped by `page.evaluate`, so it references nothing outside itself. */
function censusInPage(): PageCensus {
  const slide = document.querySelector("#deck > .slide");
  const empty: PageCensus = {
    lines: [],
    blocks: [],
    chars: { html: 0, decoration: 0 },
    links: 0,
    heading: false,
    origin: { left: 0, top: 0 },
  };
  if (!(slide instanceof HTMLElement)) {
    return empty;
  }
  const origin = slide.getBoundingClientRect();
  const blockOf = (el: Element): Element => {
    for (let node: Element | null = el; node; node = node.parentElement) {
      const display = getComputedStyle(node).display;
      if (node === slide || (display !== "inline" && display !== "contents")) {
        return node;
      }
    }
    return slide;
  };
  const shown = (el: Element): boolean => {
    for (let node: Element | null = el; node && node !== slide.parentElement; ) {
      if (Number(getComputedStyle(node).opacity) === 0) {
        return false;
      }
      node = node.parentElement;
    }
    return getComputedStyle(el).visibility === "visible";
  };
  // The page has its own copy: this function is shipped alone.
  const eastAsianText = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/u;
  type Glyph = {
    left: number;
    top: number;
    right: number;
    bottom: number;
    kind: "html" | "decoration";
    eastAsian: boolean;
    block: Element;
  };
  const glyphs: Glyph[] = [];
  const inks = new Map<Element, string>();
  const chars = { html: 0, decoration: 0 };
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const range = document.createRange();
  const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const parent = text.parentElement;
    if (!parent || !/\S/u.test(text.data) || parent.closest("svg, script, style, template")) {
      continue;
    }
    if (!shown(parent)) {
      continue;
    }
    const kind = parent.closest('[aria-hidden="true"]') ? "decoration" : "html";
    const block = blockOf(parent);
    for (const { segment, index } of segmenter.segment(text.data)) {
      if (!/\S/u.test(segment)) {
        continue;
      }
      range.setStart(text, index);
      range.setEnd(text, index + segment.length);
      const rect = [...range.getClientRects()].find((box) => box.width > 0 && box.height > 0);
      if (!rect) {
        continue;
      }
      chars[kind]++;
      if (kind === "html") {
        inks.set(block, (inks.get(block) ?? "") + segment);
      }
      glyphs.push({
        left: rect.left - origin.left,
        top: rect.top - origin.top,
        right: rect.right - origin.left,
        bottom: rect.bottom - origin.top,
        kind,
        eastAsian: eastAsianText.test(segment),
        block,
      });
    }
  }
  // A block's glyphs on one line are a line, cut where another block's text stands between two
  // of them, as a chip set in a sentence does: each piece is measured by its own ends.
  type Line = CensusLine & { block: Element };
  const rows: Array<{ top: number; bottom: number; block: Element; kind: string; of: Glyph[] }> =
    [];
  for (const glyph of glyphs) {
    const middle = (glyph.top + glyph.bottom) / 2;
    const row = rows.find(
      (each) =>
        each.block === glyph.block &&
        each.kind === glyph.kind &&
        middle > each.top &&
        middle < each.bottom,
    );
    if (row) {
      row.top = Math.min(row.top, glyph.top);
      row.bottom = Math.max(row.bottom, glyph.bottom);
      row.of.push(glyph);
    } else {
      rows.push({
        top: glyph.top,
        bottom: glyph.bottom,
        block: glyph.block,
        kind: glyph.kind,
        of: [glyph],
      });
    }
  }
  const lines: Line[] = [];
  const blockRows = new Map<Element, number>();
  for (const row of rows) {
    if (row.kind === "html") {
      blockRows.set(row.block, (blockRows.get(row.block) ?? 0) + 1);
    }
    const sorted = [...row.of].sort((a, b) => a.left - b.left);
    let open: Line | undefined;
    for (const glyph of sorted) {
      const between =
        open !== undefined &&
        glyphs.some(
          (other) =>
            other.block !== glyph.block &&
            (other.left + other.right) / 2 > (open?.right ?? 0) &&
            (other.left + other.right) / 2 < glyph.left &&
            (other.top + other.bottom) / 2 > row.top &&
            (other.top + other.bottom) / 2 < row.bottom,
        );
      if (open && !between) {
        open.left = Math.min(open.left, glyph.left);
        open.top = Math.min(open.top, glyph.top);
        open.right = Math.max(open.right, glyph.right);
        open.bottom = Math.max(open.bottom, glyph.bottom);
        open.chars++;
        open.eastAsian ||= glyph.eastAsian;
        open.other ||= !glyph.eastAsian;
      } else {
        open = {
          left: glyph.left,
          top: glyph.top,
          right: glyph.right,
          bottom: glyph.bottom,
          chars: 1,
          kind: glyph.kind,
          eastAsian: glyph.eastAsian,
          other: !glyph.eastAsian,
          block: glyph.block,
        };
        lines.push(open);
      }
    }
  }
  return {
    lines: lines.map(({ block: _block, ...line }) => line),
    blocks: [...inks].map(([block, ink]) => ({ ink, lines: blockRows.get(block) ?? 0 })),
    chars,
    links: [...slide.querySelectorAll("a[href]")].filter((link) => /\S/u.test(link.textContent))
      .length,
    heading: [...slide.querySelectorAll("h1, h2, h3, [role=heading]")].some((heading) =>
      /\S/u.test(heading.textContent),
    ),
    origin: { left: origin.left, top: origin.top },
  };
}

/** What `DOMSnapshot.captureSnapshot` answers, as far as this reads it. */
type Snapshot = {
  strings: string[];
  documents: Array<{
    nodes: { pseudoType?: { index: number[]; value: number[] } };
    layout: { nodeIndex: number[]; text: number[]; styles: number[][] };
    textBoxes: { layoutIndex: number[]; bounds: number[][]; start: number[]; length: number[] };
  }>;
};

/**
 * The lines `::before` and `::after` draw, which the page cannot read: their text, counters
 * resolved, and where Chromium laid each piece, through the DevTools protocol.
 */
async function pseudoTexts(
  page: Page,
  origin: { left: number; top: number },
): Promise<{ lines: CensusLine[]; blocks: CensusBlock[] }> {
  const cdp = await page.context().newCDPSession(page);
  try {
    const snapshot = (await cdp.send("DOMSnapshot.captureSnapshot", {
      computedStyles: ["visibility", "opacity"],
    })) as Snapshot;
    const lines: Array<CensusLine & { node: number }> = [];
    const inks = new Map<number, string>();
    for (const doc of snapshot.documents) {
      const pseudo = new Map<number, string>();
      doc.nodes.pseudoType?.index.forEach((node, at) => {
        pseudo.set(node, snapshot.strings[doc.nodes.pseudoType?.value[at] ?? -1] ?? "");
      });
      doc.textBoxes.layoutIndex.forEach((layout, at) => {
        const node = doc.layout.nodeIndex[layout] ?? -1;
        const type = pseudo.get(node);
        const [visibility = -1, opacity = -1] = doc.layout.styles[layout] ?? [];
        if (
          (type !== "before" && type !== "after") ||
          snapshot.strings[visibility] !== "visible" ||
          Number(snapshot.strings[opacity]) === 0
        ) {
          return;
        }
        const start = doc.textBoxes.start[at] ?? 0;
        const text = (snapshot.strings[doc.layout.text[layout] ?? -1] ?? "").slice(
          start,
          start + (doc.textBoxes.length[at] ?? 0),
        );
        const ink = text.replace(/\s+/gu, "");
        const chars = [...ink].length;
        const [x = 0, y = 0, width = 0, height = 0] = doc.textBoxes.bounds[at] ?? [];
        if (chars === 0 || width <= 0 || height <= 0) {
          return;
        }
        inks.set(node, (inks.get(node) ?? "") + ink);
        const box = {
          left: x - origin.left,
          top: y - origin.top,
          right: x + width - origin.left,
          bottom: y + height - origin.top,
        };
        const middle = (box.top + box.bottom) / 2;
        const line = lines.find(
          (each) => each.node === node && middle > each.top && middle < each.bottom,
        );
        const eastAsian = [...ink].some((char) => EAST_ASIAN.test(char));
        const other = [...ink].some((char) => !EAST_ASIAN.test(char));
        if (line) {
          line.left = Math.min(line.left, box.left);
          line.top = Math.min(line.top, box.top);
          line.right = Math.max(line.right, box.right);
          line.bottom = Math.max(line.bottom, box.bottom);
          line.chars += chars;
          line.eastAsian ||= eastAsian;
          line.other ||= other;
        } else {
          lines.push({ ...box, chars, kind: "pseudo", eastAsian, other, node });
        }
      });
    }
    return {
      lines: lines.map(({ node: _node, ...line }) => line),
      // A pseudo-element's text is a block of its own: it is edited as one, or not at all.
      blocks: [...inks].map(([node, ink]) => ({
        ink,
        lines: lines.filter((line) => line.node === node).length,
      })),
    };
  } finally {
    await cdp.detach();
  }
}

/** Every text's fill taken away, a pseudo-element's too, and nothing else: what is left is the slide without its text. */
const BARE_CSS =
  "*, *::before, *::after { -webkit-text-fill-color: transparent !important; text-decoration-color: transparent !important; transition: none !important; }";

/**
 * Loads a slide's page as the exporter does, counts what it shows, and shoots it twice: as it is,
 * to `full`, and with its text taken out, to `bare`.
 */
export async function censusSlide(
  page: Page,
  html: string,
  shots: { full: string; bare: string },
): Promise<SlideCensus> {
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const { origin, ...census } = await page.evaluate(censusInPage);
  const pseudo = await pseudoTexts(page, origin);
  await page.screenshot({ path: shots.full, fullPage: false });
  await page.evaluate((css) => {
    const style = document.createElement("style");
    style.id = "dek-pptx-eval-bare";
    style.textContent = css;
    document.head.append(style);
  }, BARE_CSS);
  await page.screenshot({ path: shots.bare, fullPage: false });
  await page.evaluate(() => document.getElementById("dek-pptx-eval-bare")?.remove());
  return {
    ...census,
    lines: [...census.lines, ...pseudo.lines],
    blocks: [...census.blocks, ...pseudo.blocks],
    chars: { ...census.chars, pseudo: pseudo.lines.reduce((sum, line) => sum + line.chars, 0) },
  };
}
