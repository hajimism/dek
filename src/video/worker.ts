#!/usr/bin/env bun
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { importPlaywright } from "../core/playwright.ts";
import type { Position } from "../core/step.ts";
import {
  frameStops,
  holdMs,
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
    const beat = request.timeline.beats[index];
    const next = request.timeline.beats[index + 1];
    const beatMs = Math.max(
      1,
      (next?.start ?? request.timeline.durationMs) - (beat?.start ?? event.at),
    );

    const duration = await page.evaluate(async (position) => {
      type Go = (next: unknown) => Promise<void>;
      const w = window as unknown as {
        dekGo?: Go;
        __dekPendingGo?: Promise<void>;
      };
      const go = w.dekGo;
      if (!go) {
        return 0;
      }
      const original = document.startViewTransition?.bind(document);
      let captured: ViewTransition | undefined;
      if (original) {
        const wrapped: typeof document.startViewTransition = (update) => {
          captured = original(update);
          return captured;
        };
        document.startViewTransition = wrapped;
      }
      w.__dekPendingGo = go(position);
      void w.__dekPendingGo.catch(() => undefined);
      if (original) {
        document.startViewTransition = original;
      }
      if (captured) {
        await captured.ready;
      } else {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      let max = 0;
      for (const animation of document.getAnimations()) {
        animation.pause();
        const timing = animation.effect?.getComputedTiming();
        const durationMs = typeof timing?.duration === "number" ? timing.duration : 0;
        max = Math.max(max, (timing?.delay ?? 0) + durationMs);
      }
      return max;
    }, event.position);

    const stops = frameStops(duration, request.fps);
    let previous = 0;
    for (const stop of stops) {
      await page.evaluate((ms) => {
        for (const animation of document.getAnimations()) {
          animation.currentTime = ms;
        }
      }, stop);
      const path = join(request.outDir, `frame-${String(frames.length).padStart(4, "0")}.png`);
      await page.screenshot({ path, type: "png" });
      frames.push({ path, durationMs: stop - previous, kind: "animation" });
      previous = stop;
    }

    await page.evaluate(async () => {
      for (const animation of document.getAnimations()) {
        animation.finish();
      }
      const pending = (window as unknown as { __dekPendingGo?: Promise<void> }).__dekPendingGo;
      if (pending) {
        await pending;
      }
    });

    const path = join(request.outDir, `frame-${String(frames.length).padStart(4, "0")}.png`);
    await page.screenshot({ path, type: "png" });
    frames.push({ path, durationMs: holdMs(beatMs, duration), kind: "hold" });
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
