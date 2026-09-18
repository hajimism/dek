import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { z } from "zod";
import type { VoiceDict } from "./cue.ts";
import { DekError } from "./error.ts";
import { DEFAULT_PAUSE, type PauseConfig, type Timeline } from "./timeline.ts";

export type VoiceSettings = {
  engine: string;
  speaker: string;
  speed: number;
  pause: PauseConfig;
};

export type VoiceResolved = {
  styleId: number;
  engineVersion: string;
  speaker: string;
};

const VoiceToml = z.object({
  engine: z.string().default("voicevox"),
  speaker: z.string(),
  speed: z.number().default(1),
  pause: z
    .object({
      sentence: z.number().optional(),
      beat: z.number().optional(),
    })
    .optional(),
});

const DictEntry = z.object({
  kana: z.string(),
  accent: z.number().optional(),
});

export function voiceDir(deckDir: string): string {
  return join(deckDir, "voice");
}

export function hasVoice(deckDir: string): boolean {
  return existsSync(join(voiceDir(deckDir), "voice.toml"));
}

export function voiceCacheDir(projectRoot: string, deckName: string): string {
  return join(projectRoot, ".dek", "voice", deckName);
}

export function voiceCacheFile(projectRoot: string, deckName: string, file: string): string {
  return join(voiceCacheDir(projectRoot, deckName), file);
}

export function loadVoiceSettings(deckDir: string): VoiceSettings {
  const path = join(voiceDir(deckDir), "voice.toml");
  if (!existsSync(path)) {
    throw new DekError("voice.toml not found", {
      path,
      hint: "add decks/<name>/voice/voice.toml or [voice] in dek.toml and run `dek new`",
    });
  }
  let parsed: unknown;
  try {
    parsed = Bun.TOML.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new DekError("invalid voice.toml", { path, cause: error });
  }
  const result = VoiceToml.safeParse(parsed ?? {});
  if (!result.success) {
    throw new DekError(result.error.message, { path });
  }
  return {
    engine: result.data.engine,
    speaker: result.data.speaker,
    speed: result.data.speed,
    pause: {
      sentence: result.data.pause?.sentence ?? DEFAULT_PAUSE.sentence,
      beat: result.data.pause?.beat ?? DEFAULT_PAUSE.beat,
    },
  };
}

export function loadVoiceDict(deckDir: string): VoiceDict {
  const path = join(voiceDir(deckDir), "dict.toml");
  if (!existsSync(path)) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = Bun.TOML.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new DekError("invalid dict.toml", { path, cause: error });
  }
  if (!parsed || typeof parsed !== "object") {
    return {};
  }
  const dict: VoiceDict = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const entry = DictEntry.safeParse(value);
    if (!entry.success) {
      throw new DekError(`invalid dict entry "${key}"`, { path });
    }
    dict[key] = entry.data;
  }
  return dict;
}

export function writeVoiceDict(deckDir: string, dict: VoiceDict): string {
  const dir = voiceDir(deckDir);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "dict.toml");
  const body = Object.entries(dict)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => {
      const accent = entry.accent !== undefined ? `\naccent = ${entry.accent}` : "";
      return `[${escapeTomlKey(key)}]\nkana = ${JSON.stringify(entry.kana)}${accent}\n`;
    })
    .join("\n");
  writeFileSync(path, body || "# voice dictionary\n");
  return path;
}

export function formatVoiceToml(settings: {
  engine: string;
  speaker: string;
  speed?: number;
}): string {
  return `engine  = ${JSON.stringify(settings.engine)}
speaker = ${JSON.stringify(settings.speaker)}
speed   = ${settings.speed ?? 1}
pause   = { sentence = ${DEFAULT_PAUSE.sentence}, beat = ${DEFAULT_PAUSE.beat} }
`;
}

const TimelineSchema = z.object({
  audio: z.string(),
  durationMs: z.number(),
  beats: z.array(
    z.object({
      position: z.object({
        slideIndex: z.number(),
        beatIndex: z.number(),
      }),
      start: z.number(),
      end: z.number(),
      sentences: z.array(
        z.object({
          text: z.string(),
          kana: z.string(),
          start: z.number(),
          end: z.number(),
        }),
      ),
    }),
  ),
});

export function loadCachedTimeline(projectRoot: string, deckName: string): Timeline | undefined {
  const path = voiceCacheFile(projectRoot, deckName, "timeline.json");
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    const result = TimelineSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
    if (result.success) {
      return result.data;
    }
  } catch (error) {
    throw new DekError("invalid timeline.json", {
      path,
      hint: "run `dek voice`",
      cause: error,
    });
  }
  throw new DekError("invalid timeline.json", {
    path,
    hint: "run `dek voice`",
  });
}

export function tryLoadCachedTimeline(projectRoot: string, deckName: string): Timeline | undefined {
  try {
    return loadCachedTimeline(projectRoot, deckName);
  } catch (error) {
    if (error instanceof DekError) {
      return undefined;
    }
    throw error;
  }
}

export function resolveTimelineAudio(
  timeline: Pick<Timeline, "audio">,
  timelinePath: string,
): string {
  const audio = timeline.audio;
  if (audio && isAbsolute(audio) && existsSync(audio)) {
    return audio;
  }
  const relativeName = !audio || isAbsolute(audio) ? "audio.wav" : audio;
  const beside = join(dirname(timelinePath), relativeName);
  if (existsSync(beside)) {
    return beside;
  }
  return audio || beside;
}

export function writeResolved(
  projectRoot: string,
  deckName: string,
  resolved: VoiceResolved,
): string {
  const dir = voiceCacheDir(projectRoot, deckName);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "resolved.json");
  writeFileSync(path, `${JSON.stringify(resolved, null, 2)}\n`);
  return path;
}

export function utteranceHash(input: {
  text: string;
  engine: string;
  engineVersion: string;
  styleId: number;
  speed: number;
}): string {
  return createHash("sha256")
    .update(
      `${input.text}\0${input.engine}\0${input.engineVersion}\0${input.styleId}\0${input.speed}`,
    )
    .digest("hex")
    .slice(0, 16);
}

function escapeTomlKey(key: string): string {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
}
