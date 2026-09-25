import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../core/config.ts";
import { renderDeckDocument } from "../core/document.ts";
import { DekError } from "../core/error.ts";
import { cacheDir, type DistOptions, distDir, distFile } from "../core/path.ts";
import {
  asResolvedDeck,
  type Project,
  type ProjectDeck,
  type ResolvedDeck,
  requireSection,
} from "../core/resolve.ts";
import { dropLinks, outputDir, outputPath, replaceFile } from "../core/safe-fs.ts";
import { logicalSize } from "../core/size.ts";
import { sliceTimeline, slideTimeRange, type Timeline } from "../core/timeline.ts";
import {
  hasVoice,
  loadCachedTimeline,
  loadVoiceSettings,
  resolveTimelineAudio,
  voiceCacheFile,
  voiceMissingError,
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

export type BakeVideoOptions = DistOptions & {
  slug?: string;
  fps?: number;
  runner?: VideoRunner;
};

export async function bakeVideo(dir: string, options?: BakeVideoOptions): Promise<BakeVideoResult>;
export async function bakeVideo(
  source: ResolvedDeck,
  options?: BakeVideoOptions,
): Promise<BakeVideoResult>;
export async function bakeVideo(
  input: string | ResolvedDeck,
  options: BakeVideoOptions = {},
): Promise<BakeVideoResult> {
  const { project, deck } = asResolvedDeck(input);
  return bakeProjectDeck(project, deck, options);
}

async function bakeProjectDeck(
  project: Project,
  deck: ProjectDeck,
  options: BakeVideoOptions = {},
): Promise<BakeVideoResult> {
  if (!hasVoice(deck.dir)) {
    throw voiceMissingError(deck.dir);
  }
  const timelinePath = voiceCacheFile(deck.dir, "timeline.json");
  if (!existsSync(timelinePath)) {
    throw new DekError("Timeline not found", {
      path: timelinePath,
      hint: "run `dek voice`",
    });
  }
  const loaded = loadCachedTimeline(deck.dir);
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

  const videoCache = cacheDir(deck.dir, "video");
  const outDir = options.slug ? videoCache : join(videoCache, "_full");
  // Chromium writes frames here by name; a link planted at one would take the frame elsewhere.
  dropLinks(outputDir(outDir, project.root));

  if (options.slug) {
    const slideIndex = deck.deck.sections.findIndex((section) => section.slug === options.slug);
    if (slideIndex < 0) {
      requireSection(deck, options.slug);
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
    ? join(videoCache, `${options.slug}.mp4`)
    : distFile(project, deck, "mp4", options);
  await muxVideo({
    frames: captured.frames,
    audioPath: timeline.audio,
    outPath: outputPath(out, project.root),
  });

  if (options.slug) {
    return { out };
  }

  const settings = loadVoiceSettings(deck.dir);
  const titles = deck.deck.sections.map((section, index) => {
    const beat = timeline.beats.find((entry) => entry.position.slideIndex === index);
    return { slug: section.slug, title: section.title, startMs: beat?.start ?? 0 };
  });
  const stem = join(distDir(project, deck, options), deck.name);
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
  replaceFile(
    slicedAudioPath,
    sliceWav(readFileSync(timeline.audio), range.start, sliced.durationMs),
  );
  return { ...sliced, audio: slicedAudioPath };
}
