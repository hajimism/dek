import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  planCapture,
  type VideoCaptureRequest,
  type VideoCaptureResponse,
  type VideoFrame,
} from "../../src/video/recorder.ts";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** Stands in for the video worker without a browser: one 1×1 hold frame per planned go. */
export function captureHoldFrames(request: VideoCaptureRequest): VideoCaptureResponse {
  mkdirSync(request.outDir, { recursive: true });
  const frames: VideoFrame[] = planCapture(request.timeline).map((go, index) => {
    const path = join(request.outDir, `frame-${String(index).padStart(4, "0")}.png`);
    if (!existsSync(path)) {
      writeFileSync(path, PNG);
    }
    return { path, durationMs: go.durationMs, kind: "hold" };
  });
  if (frames.length === 0) {
    const path = join(request.outDir, "frame-0000.png");
    writeFileSync(path, PNG);
    frames.push({ path, durationMs: Math.max(1, request.timeline.durationMs), kind: "hold" });
  }
  return { frames };
}
