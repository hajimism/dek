import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadConfig } from "../core/config.ts";
import { renderDeckDocument } from "../core/document.ts";
import { DekError } from "../core/error.ts";
import {
  asResolvedDeck,
  type Project,
  type ProjectDeck,
  type ResolvedDeck,
} from "../core/resolve.ts";
import { logicalSize } from "../core/size.ts";
import { sliceTimeline, slideTimeRange, type Timeline } from "../core/timeline.ts";
import {
  hasVoice,
  loadCachedTimeline,
  loadVoiceSettings,
  resolveTimelineAudio,
  voiceCacheFile,
} from "../core/voice.ts";
import { playerScript } from "../runtime/player.ts";
import { sliceWav } from "../voice/wav.ts";
import { muxVideo } from "./mux.ts";
import { defaultVideoRunner, type VideoRunner } from "./recorder.ts";
import { writeVideoSidecars } from "./sidecar.ts";

export type BakeVideoResult = {
  out: string;
  vtt?: string;
  chapters?: string;
  credits?: string;
};

export async function bakeVideo(
  dir: string,
  options?: { slug?: string; fps?: number; runner?: VideoRunner },
): Promise<BakeVideoResult>;
export async function bakeVideo(
  source: ResolvedDeck,
  options?: { slug?: string; fps?: number; runner?: VideoRunner },
): Promise<BakeVideoResult>;
export async function bakeVideo(
  input: string | ResolvedDeck,
  options: { slug?: string; fps?: number; runner?: VideoRunner } = {},
): Promise<BakeVideoResult> {
  const { project, deck } = asResolvedDeck(input);
  return bakeProjectDeck(project, deck, options);
}

export async function bakeProjectDeck(
  project: Project,
  deck: ProjectDeck,
  options: { slug?: string; fps?: number; runner?: VideoRunner } = {},
): Promise<BakeVideoResult> {
  if (!hasVoice(deck.dir)) {
    throw new DekError("voice.toml not found", {
      path: join(deck.dir, "voice", "voice.toml"),
      hint: "add voice/ then run `dek voice`",
    });
  }
  const timelinePath = voiceCacheFile(project.root, deck.name, "timeline.json");
  if (!existsSync(timelinePath)) {
    throw new DekError("Timeline not found", {
      path: timelinePath,
      hint: "run `dek voice`",
    });
  }
  const loaded = loadCachedTimeline(project.root, deck.name);
  if (!loaded) {
    throw new DekError("Timeline not found", {
      path: timelinePath,
      hint: "run `dek voice`",
    });
  }
  let timeline = { ...loaded, audio: resolveTimelineAudio(loaded, timelinePath) };
  const fps = options.fps ?? 30;
  const size = logicalSize(deck.deck.ratio);
  const html = await renderDeckDocument(deck, {
    mode: "video",
    inlineAssets: true,
    includeNotes: false,
    config: loadConfig(project.configPath),
    playerScript: await playerScript(),
  });

  const outDir = options.slug
    ? join(project.root, ".dek", "video", deck.name)
    : join(project.root, ".dek", "video", deck.name, "_full");
  mkdirSync(outDir, { recursive: true });

  if (options.slug) {
    const slideIndex = deck.deck.sections.findIndex((section) => section.slug === options.slug);
    if (slideIndex < 0) {
      throw new DekError(`section "${options.slug}" not found`, {
        path: deck.scriptPath,
        hint: "run `dek ls`",
      });
    }
    timeline = sliceTimelineAudio(timeline, slideIndex, join(outDir, `${options.slug}.wav`));
  }

  const runner = options.runner ?? defaultVideoRunner;
  const captured = await runner({
    html,
    timeline,
    fps,
    viewport: size,
    outDir,
    ...(options.slug ? { slug: options.slug } : {}),
  });
  if (!captured) {
    throw new DekError("video capture failed", {
      hint: "install Playwright or set DEK_VIDEO",
    });
  }

  const out = options.slug
    ? join(project.root, ".dek", "video", deck.name, `${options.slug}.mp4`)
    : join(project.root, "dist", `${deck.name}.mp4`);
  mkdirSync(dirname(out), { recursive: true });
  await muxVideo({ frames: captured.frames, audioPath: timeline.audio, outPath: out });

  if (options.slug) {
    return { out };
  }

  const settings = loadVoiceSettings(deck.dir);
  const titles = deck.deck.sections.map((section, index) => {
    const beat = timeline.beats.find((entry) => entry.position.slideIndex === index);
    return { slug: section.slug, title: section.title, startMs: beat?.start ?? 0 };
  });
  const stem = join(project.root, "dist", deck.name);
  const sidecars = writeVideoSidecars({
    timeline,
    titles,
    speaker: settings.speaker,
    engine: settings.engine,
    stem,
  });
  return { out, ...sidecars };
}

export function sliceTimelineAudio(
  timeline: Timeline,
  slideIndex: number,
  slicedAudioPath: string,
): Timeline {
  const range = slideTimeRange(timeline, slideIndex);
  if (!range) {
    throw new DekError(`no timeline beats for slide ${slideIndex}`, {
      hint: "run `dek voice`",
    });
  }
  if (!existsSync(timeline.audio)) {
    throw new DekError("audio not found", {
      path: timeline.audio,
      hint: "run `dek voice`",
    });
  }
  const sliced = sliceTimeline(timeline, slideIndex);
  writeFileSync(
    slicedAudioPath,
    sliceWav(readFileSync(timeline.audio), range.start, sliced.durationMs),
  );
  return { ...sliced, audio: slicedAudioPath };
}
