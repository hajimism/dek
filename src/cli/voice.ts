import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DekError } from "../core/error.ts";
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
import { requireDeckFromCwd } from "./scope.ts";

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

export async function voiceCommand(options: {
  cwd: string;
  deck?: string;
  sub?: string;
  rest?: string[];
  accent?: string;
}): Promise<VoiceCliResult> {
  const { project, deck } = requireDeckFromCwd(options.cwd, options.deck);
  const sub = options.sub?.trim();
  if (!sub) {
    const result = await synthDeck({ project, deck });
    return { action: "synth", ...result };
  }
  if (sub === "speakers") {
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
  if (sub === "say") {
    const text = options.rest?.join(" ").trim();
    if (!text) {
      throw new DekError('usage: dek voice say "<text>"', {
        hint: 'usage: dek voice say "<text>"',
      });
    }
    const settings = loadVoiceSettings(deck.dir);
    const baseUrl = engineBaseUrl(settings.engine);
    const speakers = await withEngine(settings.engine, baseUrl, () => fetchSpeakers(baseUrl));
    const styleId = resolveStyleId(speakers, settings.speaker);
    const query = await fetchAudioQuery(baseUrl, text, styleId);
    query.speedScale = settings.speed;
    const wav = await fetchSynthesis(baseUrl, query, styleId);
    const path = voiceCacheFile(deck.dir, "say.wav");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, wav);
    await playWav(path);
    return { action: "say", text, path };
  }
  if (sub === "dict" && options.rest?.[0] === "add") {
    const key = options.rest[1]?.trim();
    const kana = options.rest[2]?.trim();
    if (!key || !kana) {
      throw new DekError("usage: dek voice dict add <surface> <kana>", {
        hint: "usage: dek voice dict add dek デック",
      });
    }
    const dict = loadVoiceDict(deck.dir);
    const accent = options.accent ? Number(options.accent) : undefined;
    dict[key] = { kana, ...(accent !== undefined && !Number.isNaN(accent) ? { accent } : {}) };
    const path = writeVoiceDict(deck.dir, dict);
    return { action: "dict", path, key, kana };
  }
  if (sub === "pin") {
    const timelinePath = voiceCacheFile(deck.dir, "timeline.json");
    const audioPath = voiceCacheFile(deck.dir, "audio.wav");
    if (!existsSync(timelinePath) || !existsSync(audioPath)) {
      throw new DekError("Timeline not found", {
        path: timelinePath,
        hint: "run `dek voice`",
      });
    }
    const pinDir = join(deck.dir, "voice", "pin");
    mkdirSync(pinDir, { recursive: true });
    const pinTimeline = join(pinDir, "timeline.json");
    const pinAudio = join(pinDir, "master.wav");
    copyFileSync(timelinePath, pinTimeline);
    copyFileSync(audioPath, pinAudio);
    return { action: "pin", timelinePath: pinTimeline, audioPath: pinAudio };
  }
  throw new DekError(`unknown voice command: ${sub}`, {
    hint: "dek voice | dek voice speakers | dek voice say | dek voice dict add | dek voice pin",
  });
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
