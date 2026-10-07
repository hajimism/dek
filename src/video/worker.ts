#!/usr/bin/env bun
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Browser } from "playwright";
import { captureGo, loadVideoDoc } from "../core/capture-go.ts";
import { runPlaywrightWorker } from "../core/playwright.ts";
import {
  frameStops,
  holdMs,
  planCapture,
  type VideoCaptureRequest,
  type VideoCaptureResponse,
  type VideoFrame,
} from "./recorder.ts";

await runPlaywrightWorker(capture);

/** Records every beat of the request into `outDir`. */
async function capture(
  browser: Browser,
  request: VideoCaptureRequest,
): Promise<VideoCaptureResponse> {
  mkdirSync(request.outDir, { recursive: true });
  // A deck is self-contained (DEK020), so the page needs no network.
  const page = await browser.newPage({
    viewport: { width: request.viewport.width, height: request.viewport.height },
    offline: true,
  });
  await loadVideoDoc(page, request.html);

  const frames: VideoFrame[] = [];
  for (const go of planCapture(request.timeline)) {
    let previous = 0;
    // Only what this go started moves; slide scripts are held at t=0 by the player in video mode.
    await captureGo(
      page,
      go.position,
      (span) => frameStops(span, request.fps),
      async (ms, end) => {
        const path = join(request.outDir, `frame-${String(frames.length).padStart(4, "0")}.png`);
        await page.screenshot({ path, type: "png" });
        frames.push(
          end
            ? { path, durationMs: holdMs(go.durationMs, ms), kind: "hold" }
            : { path, durationMs: ms - previous, kind: "animation" },
        );
        previous = ms;
      },
    );
  }

  return { frames };
}
