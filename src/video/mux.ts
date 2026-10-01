import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DekcError } from "../core/error.ts";
import { runPiped, workerCommand } from "../core/spawn.ts";
import type { VideoFrame } from "./recorder.ts";

export function ffmpegResolved(): boolean {
  if (process.env.DEKC_FFMPEG) {
    return true;
  }
  try {
    const result = Bun.spawnSync(["ffmpeg", "-version"], { stdout: "pipe", stderr: "pipe" });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

function ffmpegCommand(args: string[]): string[] {
  const bin = process.env.DEKC_FFMPEG;
  if (bin) {
    return workerCommand(bin, args);
  }
  return ["ffmpeg", ...args];
}

/** An encode of mostly held frames runs well inside this, even for a long talk. */
const FFMPEG_TIMEOUT_MS = 30 * 60 * 1000;

export async function muxVideo(options: {
  frames: VideoFrame[];
  audioPath: string;
  outPath: string;
  /** A hung ffmpeg is stopped after this; 30 minutes when left out. */
  timeoutMs?: number;
}): Promise<string> {
  if (!ffmpegResolved()) {
    throw new DekcError("ffmpeg not found", {
      hint: "install ffmpeg and ensure it is on PATH",
    });
  }
  if (options.frames.length === 0) {
    throw new DekcError("no frames to mux", { hint: "run `dekc voice` then `dekc video`" });
  }
  const dir = mkdtempSync(join(tmpdir(), "dekc-mux-"));
  try {
    const listPath = join(dir, "frames.txt");
    const lines: string[] = [];
    // ffmpeg reads the list line by line; a path with a line break in it would add directives.
    const broken = options.frames.find((frame) => /[\r\n]/.test(frame.path));
    if (broken) {
      throw new DekcError("a frame path holds a line break", {
        path: broken.path,
        hint: "rename the folder so its name has no line break",
      });
    }
    for (const frame of options.frames) {
      lines.push(`file '${frame.path.replace(/'/g, "'\\''")}'`);
      lines.push(`duration ${(frame.durationMs / 1000).toFixed(3)}`);
    }
    const last = options.frames[options.frames.length - 1];
    if (last) {
      lines.push(`file '${last.path.replace(/'/g, "'\\''")}'`);
    }
    writeFileSync(listPath, `${lines.join("\n")}\n`);

    const args = [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-i",
      options.audioPath,
      "-vf",
      "pad=ceil(iw/2)*2:ceil(ih/2)*2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-shortest",
      options.outPath,
    ];
    const { stderr, exitCode } = await runPiped(ffmpegCommand(args), {
      label: "ffmpeg failed",
      hint: "check ffmpeg output",
      timeoutMs: options.timeoutMs ?? FFMPEG_TIMEOUT_MS,
    });
    if (exitCode !== 0) {
      throw new DekcError("ffmpeg failed", { hint: stderr.slice(0, 200) || "check ffmpeg output" });
    }
    return options.outPath;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
