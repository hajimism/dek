import type { VisualPage, VisualRequest } from "../../src/core/playwright.ts";

/** The slide pages a request renders; only a pages request has any. */
export function pagesOf(request: VisualRequest | undefined): VisualPage[] {
  return request?.kind === "pages" ? request.pages : [];
}

/** Writes every file the request names, as the worker would: shots, a morph frame, a PDF. */
export async function writeRequested(request: VisualRequest, content = ""): Promise<void> {
  const paths = [
    ...pagesOf(request).flatMap((page) => (page.screenshotPath ? [page.screenshotPath] : [])),
    ...(request.kind === "morph" ? [request.screenshotPath] : []),
    ...(request.kind === "pdf" ? [request.pdfPath] : []),
  ];
  for (const path of paths) {
    await Bun.write(path, content);
  }
}
