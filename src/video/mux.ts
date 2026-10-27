// biome-ignore lint/style/noRestrictedImports: mkdtempSync, rmSync, and writeFileSync, for ffmpeg's frame list in a folder of its own in the system's temp folder.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DekError } from "../core/error.ts";
import { runPiped, workerCommand } from "../core/spawn.ts";
import type { VideoFrame } from "./recorder.ts";

/** `ffmpeg -version` prints and exits at once; one that takes longer is stuck. */
const FFMPEG_PROBE_TIMEOUT_MS = 10_000;

/**
 * True when ffmpeg is there to run: DEK_FFMPEG names one, or `ffmpeg -version` on PATH exits 0.
 * An ffmpeg that does not answer within `timeoutMs` is killed, and is an error that says so.
 */
export function ffmpegResolved(timeoutMs = FFMPEG_PROBE_TIMEOUT_MS): boolean {
  if (process.env.DEK_FFMPEG) {
    return true;
  }
  let result: Bun.SyncSubprocess<"ignore", "ignore">;
  try {
    // The environment as it is now, as runPiped passes it: left out, Bun passes the one dek
    // started with. Nothing is piped, so a process it leaves behind cannot hold dek.
    // biome-ignore lint/nursery/noJsRestrictedProperties: ffmpegResolved is synchronous, for tests too; the probe has its own timeout and SIGKILL, and the encode runs through runPiped.
    result = Bun.spawnSync(["ffmpeg", "-version"], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      env: process.env,
      timeout: timeoutMs,
      killSignal: "SIGKILL",
    });
  } catch {
    return false;
  }
  if (result.exitedDueToTimeout) {
    throw new DekError(`ffmpeg did not answer \`ffmpeg -version\` within ${timeoutMs / 1000}s`, {
      hint: "check the ffmpeg on PATH, or set DEK_FFMPEG to an ffmpeg that runs, then run the command again",
    });
  }
  return result.exitCode === 0;
}

function ffmpegCommand(args: string[]): string[] {
  const bin = process.env.DEK_FFMPEG;
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
    throw new DekError("ffmpeg not found", {
      hint: "install ffmpeg and ensure it is on PATH",
    });
  }
  if (options.frames.length === 0) {
    throw new DekError("no frames to mux", { hint: "run `dekc voice` then `dekc video`" });
  }
  const dir = mkdtempSync(join(tmpdir(), "dek-mux-"));
  try {
    const listPath = join(dir, "frames.txt");
    const lines: string[] = [];
    // ffmpeg reads the list line by line; a path with a line break in it would add directives.
    const broken = options.frames.find((frame) => /[\r\n]/.test(frame.path));
    if (broken) {
      throw new DekError("a frame path holds a line break", {
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
      throw new DekError("ffmpeg failed", { hint: stderr.slice(0, 200) || "check ffmpeg output" });
    }
    return options.outPath;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
