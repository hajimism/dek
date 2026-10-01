import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { z } from "zod";
import type { VoiceDict } from "./cue.ts";
import { deckPaths } from "./deck-paths.ts";
import { DekcError } from "./error.ts";
import { cacheDir, deckProjectRoot } from "./path.ts";
import { readDeckFile } from "./resolve.ts";
import { writeInside } from "./safe-fs.ts";
import type { Deck } from "./schema.ts";
import { lastStop, type Position, resolveStop } from "./step.ts";
import {
  type BeatTiming,
  DEFAULT_LEAD_MS,
  DEFAULT_PAUSE,
  type PauseConfig,
  type Timeline,
  type Utterance,
} from "./timeline.ts";
import { parseTomlWith } from "./zod.ts";

export type VoiceSettings = {
  engine: string;
  speaker: string;
  speed: number;
  pause: PauseConfig;
  lead: number;
  /** Keyed like the URL hash: `slug`, `slug/beat-id`, or `slug/2`. */
  beats: Record<string, BeatTiming>;
};

export type VoiceResolved = {
  styleId: number;
  engineVersion: string;
  speaker: string;
};

const VoiceToml = z.object({
  // A name, with a port on this machine, or a URL: "voicevox:80@host" must not pass for local.
  engine: z
    .string()
    .regex(/^(?:https?:\/\/\S+|[a-z][a-z0-9-]*(?::\d{1,5})?)$/i, {
      message: 'an engine name like "voicevox", a name and port like "voicevox:50021", or a URL',
    })
    .default("voicevox"),
  speaker: z.string(),
  speed: z.number().default(1),
  pause: z
    .object({
      sentence: z.number().optional(),
      beat: z.number().optional(),
    })
    .optional(),
  lead: z.number().min(0).default(DEFAULT_LEAD_MS),
  beats: z
    .record(
      z.string(),
      z.object({ lead: z.number().min(0).optional(), pause: z.number().min(0).optional() }),
    )
    .default({}),
});

/** Each word, a table of its reading. */
const DictToml = z.record(
  z.string(),
  z.object({
    kana: z.string(),
    accent: z.number().optional(),
  }),
);

export function hasVoice(deckDir: string): boolean {
  return existsSync(deckPaths(deckDir).voiceToml);
}

/**
 * How to give an existing deck a voice; every command that needs one and finds none says this.
 * `dekc new` copies dekc.toml `[voice]` only into decks it creates, so it is not the fix here.
 */
export const VOICE_SETUP_HINT =
  'create voice/voice.toml in the deck with a speaker, like speaker = "ずんだもん/ノーマル" (engine defaults to voicevox); see https://hajimism.github.io/dekc/guide/voice.html#setup';

export function voiceMissingError(deckDir: string): DekcError {
  return new DekcError("voice.toml not found", {
    path: deckPaths(deckDir).voiceToml,
    hint: VOICE_SETUP_HINT,
  });
}

export function voiceCacheDir(deckDir: string): string {
  return cacheDir(deckDir, "voice");
}

export function voiceCacheFile(deckDir: string, file: string): string {
  return join(voiceCacheDir(deckDir), file);
}

export function loadVoiceSettings(deckDir: string): VoiceSettings {
  const path = deckPaths(deckDir).voiceToml;
  const source = readDeckFile(deckDir, path);
  if (source === undefined) {
    throw voiceMissingError(deckDir);
  }
  const data = parseTomlWith(VoiceToml, source, {
    label: "voice.toml",
    anchor: "voice-voice-toml",
    path,
  });
  return {
    engine: data.engine,
    speaker: data.speaker,
    speed: data.speed,
    pause: {
      sentence: data.pause?.sentence ?? DEFAULT_PAUSE.sentence,
      beat: data.pause?.beat ?? DEFAULT_PAUSE.beat,
    },
    lead: data.lead,
    beats: data.beats,
  };
}

/**
 * Maps voice.toml beat keys onto cue positions. A slide key frames the slide:
 * its `lead` runs into the slide's arrival and its `pause` follows the last beat.
 * A beat key refines its own beat. Keys that match nothing are returned in
 * `unknown` so lint can report them.
 */
export function resolveBeatTiming(
  deck: Deck,
  settings: Pick<VoiceSettings, "lead" | "beats">,
): { timing: (position: Position) => BeatTiming; unknown: string[] } {
  const bySlide = new Map<number, BeatTiming>();
  const byBeat = new Map<string, BeatTiming>();
  const unknown: string[] = [];
  for (const [key, value] of Object.entries(settings.beats)) {
    const position = beatKeyPosition(deck, key);
    if (!position) {
      unknown.push(key);
    } else if (key.includes("/")) {
      byBeat.set(`${position.slideIndex}/${position.beatIndex}`, value);
    } else {
      bySlide.set(position.slideIndex, value);
    }
  }
  return {
    timing: (position) => {
      const slide = bySlide.get(position.slideIndex);
      const last = lastStop(deck.sections[position.slideIndex]?.beats ?? []);
      const merged = {
        lead: position.beatIndex === 0 ? (slide?.lead ?? settings.lead) : settings.lead,
        pause: position.beatIndex === last ? slide?.pause : undefined,
        ...byBeat.get(`${position.slideIndex}/${position.beatIndex}`),
      };
      return Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined));
    },
    unknown,
  };
}

function beatKeyPosition(deck: Deck, key: string): Position | undefined {
  const [slug, beat, ...rest] = key.split("/");
  const slideIndex = deck.sections.findIndex((section) => section.slug === slug);
  const section = deck.sections[slideIndex];
  if (!section || rest.length > 0) {
    return undefined;
  }
  if (beat === undefined) {
    return { slideIndex, beatIndex: 0 };
  }
  const beatIndex = resolveStop(section.beats, beat);
  return beatIndex === undefined ? undefined : { slideIndex, beatIndex };
}

export function loadVoiceDict(deckDir: string): VoiceDict {
  const path = deckPaths(deckDir).voiceDict;
  const source = readDeckFile(deckDir, path);
  if (source === undefined) {
    return {};
  }
  return parseTomlWith(DictToml, source, { label: "dict.toml", anchor: "voice-dict-toml", path });
}

export function writeVoiceDict(deckDir: string, dict: VoiceDict): string {
  const path = deckPaths(deckDir).voiceDict;
  const body = Object.entries(dict)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => {
      const accent = entry.accent !== undefined ? `\naccent = ${entry.accent}` : "";
      return `[${escapeTomlKey(key)}]\nkana = ${JSON.stringify(entry.kana)}${accent}\n`;
    })
    .join("\n");
  writeInside(path, body || "# voice dictionary\n", deckProjectRoot(deckDir));
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

const UtteranceSchema = z.object({
  text: z.string(),
  kana: z.string(),
  durationMs: z.number(),
});

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
      lead: z.number().optional(),
    }),
  ),
});

export function parseUtteranceJson(text: string): Utterance | undefined {
  try {
    const result = UtteranceSchema.safeParse(JSON.parse(text));
    if (result.success) {
      return result.data;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function parseTimelineJson(text: string, path?: string): Timeline {
  try {
    const result = TimelineSchema.safeParse(JSON.parse(text));
    if (result.success) {
      return result.data;
    }
  } catch (error) {
    throw new DekcError("invalid timeline.json", {
      path,
      hint: "run `dekc voice`",
      cause: error,
    });
  }
  throw new DekcError("invalid timeline.json", {
    path,
    hint: "run `dekc voice`",
  });
}

export function loadCachedTimeline(deckDir: string): Timeline | undefined {
  const path = voiceCacheFile(deckDir, "timeline.json");
  if (!existsSync(path)) {
    return undefined;
  }
  return parseTimelineJson(readFileSync(path, "utf8"), path);
}

export function tryLoadCachedTimeline(deckDir: string): Timeline | undefined {
  try {
    return loadCachedTimeline(deckDir);
  } catch (error) {
    if (error instanceof DekcError) {
      return undefined;
    }
    throw error;
  }
}

export function resolveTimelineAudio(
  timeline: Pick<Timeline, "audio">,
  timelinePath: string,
): string {
  // Only a name: the audio sits beside its timeline, and a path in the file, which a repository
  // can commit, never sends ffmpeg to read something elsewhere.
  return join(dirname(timelinePath), basename(timeline.audio || "audio.wav"));
}

export function writeResolved(deckDir: string, resolved: VoiceResolved): string {
  const path = join(voiceCacheDir(deckDir), "resolved.json");
  writeInside(path, `${JSON.stringify(resolved, null, 2)}\n`, deckProjectRoot(deckDir));
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
