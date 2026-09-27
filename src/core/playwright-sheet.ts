import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Page } from "playwright";
import { type SheetSpec, sheetHtml, sheetLayout } from "./sheet.ts";

/**
 * Draws each contact sheet from the captures on disk, one page at its own size apiece, and
 * returns their paths in order. The images go in as data: URIs, so the page loads nothing.
 */
export async function renderSheets(
  specs: SheetSpec[],
  newPage: () => Promise<Page>,
): Promise<string[]> {
  const drawn: string[] = [];
  for (const spec of specs) {
    const page = await newPage();
    try {
      await page.setViewportSize(sheetLayout(spec).size);
      await page.setContent(sheetHtml(spec, pngDataUri), { waitUntil: "load" });
      mkdirSync(dirname(spec.path), { recursive: true });
      await page.screenshot({ path: spec.path, fullPage: false });
      drawn.push(spec.path);
    } finally {
      await page.close();
    }
  }
  return drawn;
}

function pngDataUri(path: string): string {
  return `data:image/png;base64,${readFileSync(path).toString("base64")}`;
}
