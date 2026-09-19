import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DekError } from "../core/error.ts";
import { awaitPiped } from "../core/spawn.ts";
import type { VideoFrame } from "./recorder.ts";

export function ffmpegResolved(): boolean {
  if (process.env.DEK_FFMPEG) {
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
  const bin = process.env.DEK_FFMPEG;
  if (bin) {
    return bin.endsWith(".ts") ? ["bun", "--no-install", bin, ...args] : [bin, ...args];
  }
  return ["ffmpeg", ...args];
}

export async function muxVideo(options: {
  frames: VideoFrame[];
  audioPath: string;
  outPath: string;
}): Promise<string> {
  if (!ffmpegResolved()) {
    throw new DekError("ffmpeg not found", {
      hint: "install ffmpeg and ensure it is on PATH",
    });
  }
  if (options.frames.length === 0) {
    throw new DekError("no frames to mux", { hint: "run `dek voice` then `dek video`" });
  }
  const dir = mkdtempSync(join(tmpdir(), "dek-mux-"));
  try {
    const listPath = join(dir, "frames.txt");
    const lines: string[] = [];
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
    const proc = Bun.spawn(ffmpegCommand(args), { stdout: "pipe", stderr: "pipe" });
    const { stderr, exitCode: code } = await awaitPiped(proc);
    if (code !== 0) {
      throw new DekError("ffmpeg failed", { hint: stderr.slice(0, 200) || "check ffmpeg output" });
    }
    return options.outPath;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
