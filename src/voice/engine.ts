import { DekError } from "../core/error.ts";

export type VoiceSpeaker = {
  name: string;
  styles: Array<{ name: string; id: number }>;
};

export type AudioQuery = {
  accent_phrases: Array<{
    moras: Array<{ consonant_length?: number | null; vowel_length?: number | null }>;
    pause_mora?: { vowel_length?: number | null } | null;
  }>;
  speedScale: number;
  prePhonemeLength: number;
  postPhonemeLength: number;
  outputSamplingRate: number;
  kana?: string;
};

const ENGINE_PORTS: Record<string, number> = {
  voicevox: 50021,
  aivis: 10101,
  coeiroink: 50032,
  sharevox: 50025,
};

export function engineBaseUrl(engine: string): string {
  const override = process.env.DEK_VOICE_URL;
  if (override) {
    return override.replace(/\/$/, "");
  }
  if (/^https?:\/\//i.test(engine)) {
    return engine.replace(/\/$/, "");
  }
  const [name, port] = engine.split(":");
  const resolved = port ?? ENGINE_PORTS[name ?? ""] ?? ENGINE_PORTS.voicevox;
  return `http://127.0.0.1:${resolved}`;
}

export async function fetchSpeakers(baseUrl: string): Promise<VoiceSpeaker[]> {
  const res = await engineFetch(baseUrl, "/speakers");
  return (await res.json()) as VoiceSpeaker[];
}

export async function fetchEngineVersion(baseUrl: string): Promise<string> {
  const res = await engineFetch(baseUrl, "/version");
  const text = (await res.text()).trim();
  return text.replace(/^"|"$/g, "");
}

export async function fetchAudioQuery(
  baseUrl: string,
  text: string,
  speaker: number,
): Promise<AudioQuery> {
  const res = await engineFetch(
    baseUrl,
    `/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`,
    { method: "POST" },
  );
  return (await res.json()) as AudioQuery;
}

export async function fetchSynthesis(
  baseUrl: string,
  query: AudioQuery,
  speaker: number,
): Promise<Buffer> {
  const res = await engineFetch(baseUrl, `/synthesis?speaker=${speaker}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(query),
  });
  return Buffer.from(await res.arrayBuffer());
}

export function resolveStyleId(speakers: VoiceSpeaker[], speaker: string): number {
  const [name, styleName] = speaker.split("/");
  const found = speakers.find((entry) => entry.name === name);
  if (!found) {
    throw new DekError(`speaker "${speaker}" not found`, {
      hint: "run `dek voice speakers`",
    });
  }
  const style = found.styles.find((entry) => entry.name === (styleName ?? found.styles[0]?.name));
  if (!style) {
    throw new DekError(`style "${speaker}" not found`, {
      hint: "run `dek voice speakers`",
    });
  }
  return style.id;
}

export function queryDurationMs(query: AudioQuery): number {
  let seconds = query.prePhonemeLength + query.postPhonemeLength;
  for (const phrase of query.accent_phrases) {
    for (const mora of phrase.moras) {
      seconds += mora.consonant_length ?? 0;
      seconds += mora.vowel_length ?? 0;
    }
    if (phrase.pause_mora) {
      seconds += phrase.pause_mora.vowel_length ?? 0;
    }
  }
  const speed = query.speedScale || 1;
  return Math.max(0, Math.round((seconds / speed) * 1000));
}

export function engineMissingError(engine: string, baseUrl: string): DekError {
  return new DekError(`${engine} was not found at ${baseUrl}`, {
    hint: `start the engine or set voice.toml engine (tried ${baseUrl})`,
  });
}

async function engineFetch(baseUrl: string, path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, init);
  } catch (error) {
    if (error instanceof DekError) {
      throw error;
    }
    throw engineMissingError("voice engine", baseUrl);
  }
  if (!res.ok) {
    throw new DekError(`voice engine returned ${res.status} for ${path}`, {
      hint: "check the engine log",
    });
  }
  return res;
}
