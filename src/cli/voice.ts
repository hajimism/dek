import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DekError } from "../core/error.ts";
import { deckProjectRoot } from "../core/path.ts";
import { isCachedFile, writeInside } from "../core/safe-fs.ts";
import { loadVoiceDict, loadVoiceSettings, voiceCacheFile, writeVoiceDict } from "../core/voice.ts";
import {
  engineBaseUrl,
  fetchAudioQuery,
  fetchSpeakers,
  fetchSynthesis,
  resolveStyleId,
  withEngine,
} from "../voice/engine.ts";
import { synthDeck } from "../voice/synth.ts";
import type { DeckTarget } from "./scope.ts";

export type VoiceCliResult =
  | {
      action: "synth";
      synthesized: number;
      cached: number;
      timelinePath: string;
      audioPath: string;
    }
  | { action: "speakers"; speakers: Array<{ name: string; styles: string[] }> }
  | { action: "say"; text: string; path: string }
  | { action: "dict"; path: string; key: string; kana: string }
  | { action: "pin"; timelinePath: string; audioPath: string };

/** `dek voice`: synthesize the sentences that changed. */
export async function synthVoice(target: DeckTarget): Promise<VoiceCliResult> {
  return { action: "synth", ...(await synthDeck(target)) };
}

export async function listSpeakers({ deck }: DeckTarget): Promise<VoiceCliResult> {
  const settings = loadVoiceSettings(deck.dir);
  const baseUrl = engineBaseUrl(settings.engine);
  const speakers = await withEngine(settings.engine, baseUrl, () => fetchSpeakers(baseUrl));
  return {
    action: "speakers",
    speakers: speakers.map((speaker) => ({
      name: speaker.name,
      styles: speaker.styles.map((style) => style.name),
    })),
  };
}

/** Speak one sentence in the deck's voice, and keep the audio at .cache/voice/say.wav. */
export async function sayVoice({ deck }: DeckTarget, text: string): Promise<VoiceCliResult> {
  const settings = loadVoiceSettings(deck.dir);
  const baseUrl = engineBaseUrl(settings.engine);
  const speakers = await withEngine(settings.engine, baseUrl, () => fetchSpeakers(baseUrl));
  const styleId = resolveStyleId(speakers, settings.speaker);
  const query = await fetchAudioQuery(baseUrl, text, styleId);
  query.speedScale = settings.speed;
  const wav = await fetchSynthesis(baseUrl, query, styleId);
  const path = voiceCacheFile(deck.dir, "say.wav");
  writeInside(path, wav, deckProjectRoot(deck.dir));
  await playWav(path);
  return { action: "say", text, path };
}

/** Add a reading to voice/dict.toml; `accent` is checked on the command line. */
export function addReading(
  { deck }: DeckTarget,
  entry: { word: string; kana: string; accent?: number },
): VoiceCliResult {
  const dict = loadVoiceDict(deck.dir);
  dict[entry.word] = {
    kana: entry.kana,
    ...(entry.accent !== undefined ? { accent: entry.accent } : {}),
  };
  const path = writeVoiceDict(deck.dir, dict);
  return { action: "dict", path, key: entry.word, kana: entry.kana };
}

/** Copy the synthesized audio and timeline into voice/pin/, which is committed. */
export function pinVoice({ deck }: DeckTarget): VoiceCliResult {
  const timelinePath = voiceCacheFile(deck.dir, "timeline.json");
  const audioPath = voiceCacheFile(deck.dir, "audio.wav");
  // What is pinned is committed; only what `dek voice` wrote, never a link planted in the cache.
  if (!isCachedFile(timelinePath) || !isCachedFile(audioPath)) {
    throw new DekError("Timeline not found", {
      path: timelinePath,
      hint: "run `dek voice`",
    });
  }
  const root = deckProjectRoot(deck.dir);
  const pinDir = join(deck.dir, "voice", "pin");
  const pinTimeline = join(pinDir, "timeline.json");
  const pinAudio = join(pinDir, "master.wav");
  writeInside(pinTimeline, readFileSync(timelinePath), root);
  writeInside(pinAudio, readFileSync(audioPath), root);
  return { action: "pin", timelinePath: pinTimeline, audioPath: pinAudio };
}

async function playWav(path: string): Promise<void> {
  if (process.env.DEK_VOICE_PLAY === "0") {
    return;
  }
  const bin =
    process.platform === "darwin" ? "afplay" : process.platform === "win32" ? "" : "aplay";
  if (!bin) {
    return;
  }
  await new Promise<void>((resolve) => {
    const child = spawn(bin, [path], { stdio: "ignore" });
    child.on("exit", () => resolve());
    child.on("error", () => resolve());
  });
}
