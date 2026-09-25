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

const ENGINE_SETUP: Record<string, { label: string; url: string; docker?: string }> = {
  voicevox: {
    label: "VOICEVOX",
    url: "https://voicevox.hiroshiba.jp/",
    docker: "docker run --rm -p 127.0.0.1:50021:50021 voicevox/voicevox_engine:cpu-latest",
  },
  aivis: {
    label: "AivisSpeech",
    url: "https://aivis-project.com/",
    docker:
      "docker run --rm -p 127.0.0.1:10101:10101 ghcr.io/aivis-project/aivisspeech-engine:cpu-latest",
  },
  coeiroink: { label: "COEIROINK", url: "https://coeiroink.com/" },
  sharevox: { label: "SHAREVOX", url: "https://www.sharevox.app/" },
};

export function engineNameForUrl(baseUrl: string): string | undefined {
  let port: string;
  try {
    port = new URL(baseUrl).port;
  } catch {
    return undefined;
  }
  return Object.keys(ENGINE_PORTS).find((name) => String(ENGINE_PORTS[name]) === port);
}

export function engineSetupHint(engine: string): string {
  const fallback = "or point DEK_VOICE_URL or voice.toml engine at a running engine";
  if (/^https?:\/\//i.test(engine)) {
    return `start the engine at ${engine}, ${fallback}`;
  }
  const setup = ENGINE_SETUP[engine.split(":")[0] ?? ""];
  if (!setup) {
    return `start ${engine}, ${fallback}`;
  }
  const docker = setup.docker ? ` or run \`${setup.docker}\`` : "";
  return `install ${setup.label} from ${setup.url}${docker}, ${fallback}`;
}

export class EngineMissingError extends DekError {
  constructor(engine: string, baseUrl: string) {
    super(`${engine} was not found at ${baseUrl}`, { hint: engineSetupHint(engine) });
    this.name = "DekError";
  }
}

export function engineMissingError(engine: string, baseUrl: string): DekError {
  return new EngineMissingError(engine, baseUrl);
}

/**
 * Re-raises "engine is down" with the configured engine name so the hint
 * names the right setup. An engine that is up but answers with an error is
 * reported as it is; that is not an install problem.
 */
export async function withEngine<T>(
  engine: string,
  baseUrl: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof EngineMissingError) {
      throw engineMissingError(engine, baseUrl);
    }
    throw error;
  }
}

async function engineFetch(baseUrl: string, path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, init);
  } catch {
    throw engineMissingError(engineNameForUrl(baseUrl) ?? "voice engine", baseUrl);
  }
  if (!res.ok) {
    throw new DekError(`voice engine returned ${res.status} for ${path}`, {
      hint: "check the engine log",
    });
  }
  return res;
}
