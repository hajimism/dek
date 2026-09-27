import { escapeAttr, escapeHtml } from "./escape.ts";
import type { Size } from "./size.ts";

/**
 * Contact sheets: many captures on one image, so an agent reads a deck, or a slide's motion, in
 * one look instead of one file per frame. A sheet is laid out here, as boxes at pixel positions,
 * and drawn by a browser from the HTML `sheetHtml` writes.
 */

/** The longest edge a vision model reads without scaling the image down. */
export const SHEET_MAX_EDGE = 1568;
/** The most pixels a vision model reads without scaling the image down. */
export const SHEET_MAX_PIXELS = 1_150_000;
/** Part of every cache key for a sheet: a change to how sheets look makes new ones. */
export const SHEET_LAYOUT_VERSION = "1";

export type SheetCell = { image: string; label: string };
type SheetRow = { label?: string; cells: SheetCell[] };
export type SheetSpec = {
  path: string;
  title: string;
  tile: Size;
  columns: number;
  rows: SheetRow[];
};

type SheetBox = {
  kind: "title" | "label" | "image" | "caption";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  image?: string;
};

/** One capture of a slide in motion, `ms` into the go that began its beat. */
export type MotionFrame = { ms: number; path: string; end?: true };
export type MotionBeat = { label: string; frames: MotionFrame[] };

type SheetOptions = { slide: Size; title: string; dir: string };

const PAD = 16;
const GAP = 12;
const TITLE = 32;
const LABEL = 24;
const CAPTION = 20;
/** Below this a tile shows too little to judge a slide by; a long deck takes more sheets instead. */
const MIN_TILE_WIDTH = 240;

/**
 * Every slide as a tile, in order. The tiles are as large as they can be with the whole deck on one
 * sheet a vision model reads as drawn; a deck too long for that goes on over more sheets.
 */
export function overviewSheets(
  cells: SheetCell[],
  options: SheetOptions & {
    /** Fixes the column count instead of choosing it. */
    columns?: number;
  },
): SheetSpec[] {
  if (cells.length === 0) {
    return [];
  }
  const columns = options.columns ?? overviewColumns(cells.length, options.slide);
  const tile = tileFor(columns, options.slide);
  const rows = chunk(cells, columns).map((row) => ({ cells: row }));
  const pages = paginate(rows, columns, tile);
  let first = 1;
  return pages.map((page, index) => {
    const count = page.reduce((sum, row) => sum + row.cells.length, 0);
    const title = `${options.title} · slides ${first}–${first + count - 1} of ${cells.length}`;
    first += count;
    return { path: sheetPath(options.dir, index), title, tile, columns, rows: page };
  });
}

/**
 * A row for each beat, its frames left to right and its settled end last, captioned with the
 * moment each shows. A beat that does not move is one frame, captioned as such.
 */
export function motionSheets(beats: MotionBeat[], options: SheetOptions): SheetSpec[] {
  const columns = Math.max(1, ...beats.map((beat) => beat.frames.length));
  const tile = tileFor(columns, options.slide);
  const rows = beats.map((beat) => ({
    label: beat.label,
    cells: beat.frames.map((frame) => ({ image: frame.path, label: frameCaption(frame, beat) })),
  }));
  const pages = paginate(rows, columns, tile);
  return pages.map((page, index) => ({
    path: sheetPath(options.dir, index),
    title: pages.length > 1 ? `${options.title} · ${index + 1}/${pages.length}` : options.title,
    tile,
    columns,
    rows: page,
  }));
}

/** Where each title, row label, image, and caption goes, and how large the sheet is. */
export function sheetLayout(spec: SheetSpec): { size: Size; boxes: SheetBox[] } {
  const width = PAD * 2 + spec.columns * spec.tile.width + (spec.columns - 1) * GAP;
  const inner = width - PAD * 2;
  const boxes: SheetBox[] = [
    { kind: "title", x: PAD, y: PAD, width: inner, height: TITLE, text: spec.title },
  ];
  let y = PAD + TITLE;
  spec.rows.forEach((row, index) => {
    if (index > 0) {
      y += GAP;
    }
    if (row.label !== undefined) {
      boxes.push({ kind: "label", x: PAD, y, width: inner, height: LABEL, text: row.label });
      y += LABEL;
    }
    row.cells.forEach((cell, column) => {
      const x = PAD + column * (spec.tile.width + GAP);
      boxes.push({ kind: "image", x, y, ...spec.tile, image: cell.image });
      boxes.push({
        kind: "caption",
        x,
        y: y + spec.tile.height,
        width: spec.tile.width,
        height: CAPTION,
        text: cell.label,
      });
    });
    y += spec.tile.height + CAPTION;
  });
  return { size: { width, height: y + PAD }, boxes };
}

/** The sheet as a page to screenshot at its own size; `src` turns an image path into a URL. */
export function sheetHtml(spec: SheetSpec, src: (image: string) => string): string {
  const { size, boxes } = sheetLayout(spec);
  const drawn = boxes
    .map((box) => {
      const at = `left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px`;
      return box.kind === "image"
        ? `<img class="image" style="${at}" src="${escapeAttr(src(box.image ?? ""))}" alt="">`
        : `<div class="${box.kind}" style="${at}">${escapeHtml(box.text ?? "")}</div>`;
    })
    .join("\n");
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
html, body { margin: 0; background: #262626; }
.sheet { position: relative; overflow: hidden; }
.sheet > * { position: absolute; box-sizing: border-box; }
.title, .label, .caption { color: #d4d4d4; font: 12px/20px ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.title { font-size: 13px; color: #fafafa; }
.label { line-height: 22px; color: #a3a3a3; }
.caption { padding-top: 2px; }
.image { display: block; outline: 1px solid #5c5c5c; }
</style></head><body><div class="sheet" style="width:${size.width}px;height:${size.height}px">
${drawn}
</div></body></html>`;
}

/** The fewest columns, so the largest tiles, that fit the whole deck on one sheet. */
function overviewColumns(count: number, slide: Size): number {
  for (let columns = 1; columns <= count; columns++) {
    const tile = tileFor(columns, slide);
    if (tile.width < MIN_TILE_WIDTH) {
      break;
    }
    const rows = chunk(Array.from({ length: count }), columns).map(() => ({ cells: [] }));
    if (fits(rows, columns, tile)) {
      return columns;
    }
  }
  return Math.max(1, Math.floor((SHEET_MAX_EDGE - PAD * 2 + GAP) / (MIN_TILE_WIDTH + GAP)));
}

/** The tile for `columns` across the widest sheet, never larger than the slide itself. */
function tileFor(columns: number, slide: Size): Size {
  const across = Math.floor((SHEET_MAX_EDGE - PAD * 2 - (columns - 1) * GAP) / columns);
  const width = Math.min(slide.width, across);
  return { width, height: Math.round((width * slide.height) / slide.width) };
}

/** Rows split over as few sheets as keep each one within what a vision model reads as drawn. */
function paginate(rows: SheetRow[], columns: number, tile: Size): SheetRow[][] {
  const pages: SheetRow[][] = [];
  let page: SheetRow[] = [];
  for (const row of rows) {
    if (page.length > 0 && !fits([...page, row], columns, tile)) {
      pages.push(page);
      page = [];
    }
    page.push(row);
  }
  if (page.length > 0) {
    pages.push(page);
  }
  return pages;
}

function fits(rows: SheetRow[], columns: number, tile: Size): boolean {
  const { size } = sheetLayout({ path: "", title: "", tile, columns, rows });
  return (
    size.width <= SHEET_MAX_EDGE &&
    size.height <= SHEET_MAX_EDGE &&
    size.width * size.height <= SHEET_MAX_PIXELS
  );
}

function frameCaption(frame: MotionFrame, beat: MotionBeat): string {
  if (!frame.end) {
    return `${Math.round(frame.ms)} ms`;
  }
  return beat.frames.length === 1 ? "no motion" : `end · ${Math.round(frame.ms)} ms`;
}

function sheetPath(dir: string, index: number): string {
  return `${dir}/sheet-${index + 1}.png`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
