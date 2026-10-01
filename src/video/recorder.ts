import { DekError } from "../core/error.ts";
import { moduleFilePath } from "../core/path.ts";
import { playwrightResolved } from "../core/playwright.ts";
import { runJsonWorker, workerCommand } from "../core/spawn.ts";
import type { Position } from "../core/step.ts";
import { playbackSchedule, type Timeline } from "../core/timeline.ts";

export type VideoFrame = {
  path: string;
  durationMs: number;
  kind?: "animation" | "hold";
};

export type VideoCaptureRequest = {
  html: string;
  timeline: Timeline;
  fps: number;
  viewport: { width: number; height: number };
  outDir: string;
  slug?: string;
};

export type VideoCaptureResponse = {
  frames: VideoFrame[];
};

export type VideoRunner = (request: VideoCaptureRequest) => Promise<VideoCaptureResponse>;

/** A go the video plays, and how long it shows: until the next go, the first from the start. */
type PlannedGo = {
  at: number;
  position: Position;
  durationMs: number;
};

export function frameStops(animationMs: number, fps: number): number[] {
  if (animationMs <= 0) {
    return [];
  }
  const frameMs = 1000 / Math.max(1, fps);
  const count = Math.max(1, Math.round(animationMs / frameMs));
  return Array.from({ length: count }, (_, i) =>
    i === count - 1 ? animationMs : ((i + 1) * animationMs) / count,
  );
}

export function holdMs(beatMs: number, animationMs: number): number {
  return Math.max(1, beatMs - animationMs);
}

/** Every go of the talk, each shown until the next; together they cover the whole audio. */
export function planCapture(timeline: Timeline): PlannedGo[] {
  const gos = playbackSchedule(timeline);
  return gos.map((go, index) => ({
    ...go,
    durationMs: Math.max(
      1,
      (gos[index + 1]?.at ?? timeline.durationMs) - (index === 0 ? 0 : go.at),
    ),
  }));
}

export async function defaultVideoRunner(
  request: VideoCaptureRequest,
  options: { timeoutMs?: number } = {},
): Promise<VideoCaptureResponse> {
  const bin = process.env.DEK_VIDEO;
  if (bin) {
    return spawnVideoRunner(bin, request, options);
  }
  if (playwrightResolved()) {
    return spawnVideoRunner(workerPath(), request, options);
  }
  throw new DekError("video capture failed", {
    hint: "install Playwright or set DEK_VIDEO",
  });
}

function workerPath(): string {
  return moduleFilePath(new URL("./worker.ts", import.meta.url));
}

function spawnVideoRunner(
  bin: string,
  request: VideoCaptureRequest,
  options: { timeoutMs?: number },
): Promise<VideoCaptureResponse> {
  return runJsonWorker(workerCommand(bin), request, parseVideoResponse, {
    label: "video capture failed",
    hint: "install Playwright or set DEK_VIDEO",
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  });
}

/** The video worker's JSON, or null when its frames are not each a path and how long it shows. */
export function parseVideoResponse(text: string): VideoCaptureResponse | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const frames = (parsed as { frames?: unknown } | null)?.frames;
  return Array.isArray(frames) && frames.every(isVideoFrame) ? { frames } : null;
}

function isVideoFrame(value: unknown): value is VideoFrame {
  const { path, durationMs, kind } = (value ?? {}) as Record<string, unknown>;
  return (
    typeof path === "string" &&
    typeof durationMs === "number" &&
    Number.isFinite(durationMs) &&
    (kind === undefined || kind === "animation" || kind === "hold")
  );
}
