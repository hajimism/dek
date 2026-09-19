#!/usr/bin/env bun
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { importPlaywright } from "../core/playwright.ts";
import type { Position } from "../core/step.ts";
import {
  planCapture,
  type VideoCaptureRequest,
  type VideoCaptureResponse,
  type VideoFrame,
} from "./recorder.ts";
import { VIDEO_CAPTURE_STRATEGY } from "./strategy.ts";

let playwright: Awaited<ReturnType<typeof importPlaywright>>;
try {
  playwright = await importPlaywright();
} catch {
  process.exit(2);
}

const stdin = await new Response(Bun.stdin).text();
let request: VideoCaptureRequest;
try {
  request = JSON.parse(stdin) as VideoCaptureRequest;
} catch {
  process.exit(2);
}
const browser = await playwright.chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: request.viewport.width, height: request.viewport.height },
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setContent(request.html, { waitUntil: "load" });

  mkdirSync(request.outDir, { recursive: true });
  const plan = planCapture(request.timeline, request.fps);
  const frames: VideoFrame[] = [];
  const gos: Position[] = [];

  for (const [index, event] of plan.gos.entries()) {
    gos.push(event.position);
    await page.evaluate(async (position) => {
      const go = (window as unknown as { dekGo?: (next: unknown) => Promise<void> }).dekGo;
      if (go) {
        await go(position);
      }
    }, event.position);

    const planned = plan.frames.filter((frame) => frame.afterGo === index);
    for (const [offset, frame] of planned.entries()) {
      const path = join(request.outDir, `frame-${String(frames.length).padStart(4, "0")}.png`);
      await page.screenshot({ path, type: "png" });
      frames.push({ path, durationMs: frame.durationMs });
      if (frame.kind === "animation" && offset < planned.length - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(1, Math.round(frame.durationMs))),
        );
      }
    }
  }

  const response: VideoCaptureResponse = {
    frames,
    strategy: VIDEO_CAPTURE_STRATEGY,
    gos,
  };
  process.stdout.write(`${JSON.stringify(response)}\n`);
} finally {
  await browser.close();
}
