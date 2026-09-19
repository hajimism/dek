#!/usr/bin/env bun
const stdin = await new Response(Bun.stdin).text();
let request: {
  pdfPath?: string;
  pages?: Array<{ screenshotPath?: string }>;
  screenshotPath?: string;
} = {};
try {
  request = JSON.parse(stdin) as typeof request;
} catch {
  request = {};
}

await Bun.sleep(80);

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

const lastShot = [...(request.pages ?? [])].reverse().find((page) => page.screenshotPath);

process.stdout.write(
  `${JSON.stringify({
    overflows: [],
    contrasts: [],
    ...(lastShot?.screenshotPath
      ? { screenshotPath: lastShot.screenshotPath }
      : request.screenshotPath
        ? { screenshotPath: request.screenshotPath }
        : {}),
    ...(request.pdfPath ? { pdfPath: request.pdfPath } : {}),
  })}\n`,
);
