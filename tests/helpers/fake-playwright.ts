#!/usr/bin/env bun
const stdin = await new Response(Bun.stdin).text();
let request: {
  pdfPath?: string;
  pages?: Array<{ screenshotPath?: string }>;
  screenshotPath?: string;
  actions?: string[];
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

const overflows = process.env.DEK_PLAYWRIGHT_OVERFLOWS
  ? JSON.parse(process.env.DEK_PLAYWRIGHT_OVERFLOWS)
  : [];
const contrasts = process.env.DEK_PLAYWRIGHT_CONTRASTS
  ? JSON.parse(process.env.DEK_PLAYWRIGHT_CONTRASTS)
  : [];

const lastShot = [...(request.pages ?? [])].reverse().find((page) => page.screenshotPath);

process.stdout.write(
  `${JSON.stringify({
    overflows,
    contrasts,
    ...(lastShot?.screenshotPath
      ? { screenshotPath: lastShot.screenshotPath }
      : request.screenshotPath
        ? { screenshotPath: request.screenshotPath }
        : {}),
    ...(request.pdfPath ? { pdfPath: request.pdfPath } : {}),
  })}\n`,
);
