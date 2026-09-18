#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { planCapture, type VideoCaptureRequest } from "../../src/video/recorder.ts";
import { VIDEO_CAPTURE_STRATEGY } from "../../src/video/strategy.ts";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const stdin = await new Response(Bun.stdin).text();
const request = JSON.parse(stdin) as VideoCaptureRequest;
mkdirSync(request.outDir, { recursive: true });
const animationMs = Number(process.env.DEK_VIDEO_ANIMATION_MS ?? "0");
const plan = planCapture(request.timeline, request.fps, () =>
  Number.isFinite(animationMs) ? animationMs : 0,
);
const frames = [];
for (const [index, planned] of plan.frames.entries()) {
  const path = join(request.outDir, `frame-${String(index).padStart(4, "0")}.png`);
  writeFileSync(path, PNG);
  frames.push({ path, durationMs: planned.durationMs });
}
process.stdout.write(
  `${JSON.stringify({
    frames,
    strategy: VIDEO_CAPTURE_STRATEGY,
    gos: plan.gos.map((event) => event.position),
  })}\n`,
);
