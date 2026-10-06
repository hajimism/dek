#!/usr/bin/env bun
// Stands in for the Playwright worker: writes every file the request names and answers its kind.
const stdin = await new Response(Bun.stdin).text();
let request: {
  kind?: string;
  pages?: Array<{ screenshotPath?: string; slug?: string }>;
  screenshotPath?: string;
  pdfPath?: string;
} = {};
try {
  request = JSON.parse(stdin) as typeof request;
} catch {
  request = {};
}

for (const page of request.pages ?? []) {
  if (page.screenshotPath) {
    await Bun.write(page.screenshotPath, "");
  }
}
if (request.screenshotPath) {
  await Bun.write(request.screenshotPath, "");
}
if (request.pdfPath) {
  await Bun.write(request.pdfPath, "%PDF-1.4\n");
}

const overflows = (
  process.env.DEK_PLAYWRIGHT_OVERFLOWS ? JSON.parse(process.env.DEK_PLAYWRIGHT_OVERFLOWS) : []
).map((overflow: object) => ({ by: {}, ...overflow }));
const contrasts = process.env.DEK_PLAYWRIGHT_CONTRASTS
  ? JSON.parse(process.env.DEK_PLAYWRIGHT_CONTRASTS)
  : [];

// A PPTX's pages come back with no text, each slide only its picture.
const pptx = {
  slides: (request.pages ?? []).map((page) => ({
    slug: page.slug ?? "",
    description: "",
    boxes: [],
  })),
};

process.stdout.write(
  `${JSON.stringify(request.kind === "pages" ? { overflows, contrasts } : request.kind === "pptx" ? pptx : {})}\n`,
);
