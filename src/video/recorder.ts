import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DekError } from "../core/error.ts";
import { moduleFilePath } from "../core/path.ts";
import { playwrightResolved } from "../core/playwright.ts";
import { awaitPiped } from "../core/spawn.ts";
import type { Position } from "../core/step.ts";
import { playbackSchedule, type Timeline } from "../core/timeline.ts";
import { VIDEO_CAPTURE_STRATEGY } from "./strategy.ts";

export type VideoFrame = {
  path: string;
  durationMs: number;
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
  strategy: string;
  gos?: Position[];
};

export type VideoRunner = (request: VideoCaptureRequest) => Promise<VideoCaptureResponse | null>;

export type PlannedFrame = {
  kind: "animation" | "hold";
  durationMs: number;
  afterGo: number;
};

export type CapturePlan = {
  gos: Array<{ at: number; position: Position }>;
  frames: PlannedFrame[];
};

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const SPAWN_TIMEOUT_MS = 15_000;

export function planCapture(
  timeline: Timeline,
  fps: number,
  animationMs: (from: Position | undefined, to: Position) => number = () => 0,
): CapturePlan {
  const gos = playbackSchedule(timeline, animationMs);
  const frames: PlannedFrame[] = [];
  for (const [index, event] of gos.entries()) {
    const beat = timeline.beats[index];
    const next = timeline.beats[index + 1];
    const beatDuration = Math.max(
      1,
      (next?.start ?? timeline.durationMs) - (beat?.start ?? event.at),
    );
    const prev = index > 0 ? gos[index - 1]?.position : undefined;
    const anim = Math.max(0, animationMs(prev, event.position));
    const animClamped = Math.min(anim, Math.max(0, beatDuration - 1));
    if (animClamped > 0) {
      const frameMs = 1000 / Math.max(1, fps);
      const count = Math.max(1, Math.round(animClamped / frameMs));
      const each = animClamped / count;
      for (let i = 0; i < count; i++) {
        frames.push({ kind: "animation", durationMs: each, afterGo: index });
      }
    }
    frames.push({
      kind: "hold",
      durationMs: Math.max(1, beatDuration - animClamped),
      afterGo: index,
    });
  }
  return { gos, frames };
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

async function spawnVideoRunner(
  bin: string,
  request: VideoCaptureRequest,
  options: { timeoutMs?: number } = {},
): Promise<VideoCaptureResponse> {
  const cmd = bin.endsWith(".ts") ? ["bun", "--no-install", bin] : [bin];
  try {
    const proc = Bun.spawn(cmd, { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    const piped = awaitPiped(proc);
    const timeout = setTimeout(() => proc.kill(), options.timeoutMs ?? SPAWN_TIMEOUT_MS);
    try {
      proc.stdin.write(JSON.stringify(request));
      await proc.stdin.end();
    } finally {
      clearTimeout(timeout);
    }
    const { stdout: out, stderr: err, exitCode: code } = await piped;
    if (code !== 0) {
      throw new DekError("video capture failed", {
        hint: err.trim().slice(0, 200) || "check Playwright / DEK_VIDEO",
      });
    }
    const parsed = JSON.parse(out) as VideoCaptureResponse;
    if (!parsed || !Array.isArray(parsed.frames)) {
      throw new DekError("video capture failed", {
        hint: "worker returned invalid JSON",
      });
    }
    return parsed;
  } catch (error) {
    if (error instanceof DekError) {
      throw error;
    }
    throw new DekError("video capture failed", {
      hint: "install Playwright or set DEK_VIDEO",
      cause: error,
    });
  }
}

/** Deterministic helper for tests: one hold frame per scheduled beat. */
export function captureHoldFrames(request: VideoCaptureRequest): VideoCaptureResponse {
  mkdirSync(request.outDir, { recursive: true });
  const plan = planCapture(request.timeline, request.fps);
  const frames: VideoFrame[] = [];
  for (const [index, planned] of plan.frames.entries()) {
    const path = join(request.outDir, `frame-${String(index).padStart(4, "0")}.png`);
    if (!existsSync(path)) {
      writeFileSync(path, PNG);
    }
    frames.push({ path, durationMs: planned.durationMs });
  }
  if (frames.length === 0) {
    const path = join(request.outDir, "frame-0000.png");
    writeFileSync(path, PNG);
    frames.push({ path, durationMs: Math.max(1, request.timeline.durationMs) });
  }
  return { frames, strategy: VIDEO_CAPTURE_STRATEGY, gos: plan.gos.map((event) => event.position) };
}
