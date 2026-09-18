import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cuesFromDeck, splitSentences } from "../core/cue.ts";
import { type Project, type ProjectDeck, resolveDeck } from "../core/resolve.ts";
import { scheduleVoice, type Utterance } from "../core/timeline.ts";
import {
  loadVoiceDict,
  loadVoiceSettings,
  utteranceHash,
  voiceCacheDir,
  voiceCacheFile,
  writeResolved,
} from "../core/voice.ts";
import {
  engineBaseUrl,
  engineMissingError,
  fetchAudioQuery,
  fetchEngineVersion,
  fetchSpeakers,
  fetchSynthesis,
  resolveStyleId,
  type VoiceSpeaker,
} from "./engine.ts";
import { concatWavs, silentWav, wavDurationMs } from "./wav.ts";

export type SynthResult = {
  timelinePath: string;
  audioPath: string;
  synthesized: number;
  cached: number;
};

export async function synthDeck(dir: string): Promise<SynthResult>;
export async function synthDeck(source: {
  project: Project;
  deck: ProjectDeck;
}): Promise<SynthResult>;
export async function synthDeck(
  input: string | { project: Project; deck: ProjectDeck },
): Promise<SynthResult> {
  const { project, deck } = typeof input === "string" ? resolveDeck(input) : input;
  const cacheDir = voiceCacheDir(project.root, deck.name);
  mkdirSync(cacheDir, { recursive: true });
  const timelinePath = voiceCacheFile(project.root, deck.name, "timeline.json");
  const audioPath = voiceCacheFile(project.root, deck.name, "audio.wav");
  const pinTimeline = join(deck.dir, "voice", "pin", "timeline.json");
  const pinAudio = join(deck.dir, "voice", "pin", "master.wav");
  if (existsSync(pinTimeline) && existsSync(pinAudio)) {
    copyFileSync(pinAudio, audioPath);
    try {
      const parsed = JSON.parse(readFileSync(pinTimeline, "utf8")) as { audio?: string };
      writeFileSync(
        timelinePath,
        `${JSON.stringify({ ...parsed, audio: "audio.wav" }, null, 2)}\n`,
      );
    } catch {
      copyFileSync(pinTimeline, timelinePath);
    }
    return { timelinePath, audioPath, synthesized: 0, cached: 0 };
  }

  const settings = loadVoiceSettings(deck.dir);
  const dict = loadVoiceDict(deck.dir);
  const baseUrl = engineBaseUrl(settings.engine);

  let speakers: VoiceSpeaker[];
  let version: string;
  try {
    speakers = await fetchSpeakers(baseUrl);
    version = await fetchEngineVersion(baseUrl);
  } catch {
    throw engineMissingError(settings.engine, baseUrl);
  }

  const styleId = resolveStyleId(speakers, settings.speaker);
  writeResolved(project.root, deck.name, {
    styleId,
    engineVersion: version,
    speaker: settings.speaker,
  });

  const cues = cuesFromDeck(deck.deck, dict);
  const utterances: Utterance[] = [];
  const clips: Buffer[] = [];
  let synthesized = 0;
  let cached = 0;

  const texts = cues.flatMap((cue) => cue.paragraphs.flatMap(splitSentences));
  for (const text of texts) {
    const hash = utteranceHash({
      text,
      engine: settings.engine,
      engineVersion: version,
      styleId,
      speed: settings.speed,
    });
    const clipPath = join(cacheDir, `${hash}.wav`);
    const metaPath = join(cacheDir, `${hash}.json`);
    let utterance: Utterance;
    let wav: Buffer;
    if (existsSync(clipPath) && existsSync(metaPath)) {
      utterance = JSON.parse(readFileSync(metaPath, "utf8")) as Utterance;
      wav = readFileSync(clipPath);
      cached += 1;
    } else {
      const query = await fetchAudioQuery(baseUrl, text, styleId);
      query.speedScale = settings.speed;
      wav = await fetchSynthesis(baseUrl, query, styleId);
      utterance = {
        text,
        kana: query.kana ?? "",
        durationMs: 0,
      };
      writeFileSync(clipPath, wav);
      synthesized += 1;
    }
    utterance = { ...utterance, text, durationMs: wavDurationMs(wav) };
    writeFileSync(metaPath, `${JSON.stringify(utterance)}\n`);
    utterances.push(utterance);
    clips.push(wav);
  }

  const scheduled = scheduleVoice(cues, utterances, settings.pause, "audio.wav");
  const audio =
    clips.length > 0
      ? concatWavs(clips, scheduled.pauseAfterMs, scheduled.leadingMs)
      : silentWav(scheduled.timeline.durationMs);
  writeFileSync(audioPath, audio);
  writeFileSync(timelinePath, `${JSON.stringify(scheduled.timeline, null, 2)}\n`);

  return { timelinePath, audioPath, synthesized, cached };
}
