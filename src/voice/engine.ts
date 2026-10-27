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

export type EngineOptions = {
  /** Covers the whole call, from connecting to the last byte of the answer. */
  timeoutMs?: number;
};

/** /speakers and /version answer from what the engine has loaded; a stall this long is a hang. */
const PROBE_TIMEOUT_MS = 10 * 1000;

/** Reading a sentence's accents takes well under a second; this leaves room for a busy machine. */
const QUERY_TIMEOUT_MS = 60 * 1000;

/** Synthesis on a CPU can take longer than the sentence lasts; a long one fits inside this. */
const SYNTHESIS_TIMEOUT_MS = 5 * 60 * 1000;

export async function fetchSpeakers(
  baseUrl: string,
  options: EngineOptions = {},
): Promise<VoiceSpeaker[]> {
  return engineFetch(
    baseUrl,
    "/speakers",
    options.timeoutMs ?? PROBE_TIMEOUT_MS,
    (res) => res.json() as Promise<VoiceSpeaker[]>,
  );
}

export async function fetchEngineVersion(
  baseUrl: string,
  options: EngineOptions = {},
): Promise<string> {
  const text = await engineFetch(
    baseUrl,
    "/version",
    options.timeoutMs ?? PROBE_TIMEOUT_MS,
    (res) => res.text(),
  );
  return text.trim().replace(/^"|"$/g, "");
}

export async function fetchAudioQuery(
  baseUrl: string,
  text: string,
  speaker: number,
  options: EngineOptions = {},
): Promise<AudioQuery> {
  return engineFetch(
    baseUrl,
    `/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`,
    options.timeoutMs ?? QUERY_TIMEOUT_MS,
    (res) => res.json() as Promise<AudioQuery>,
    { method: "POST" },
  );
}

export async function fetchSynthesis(
  baseUrl: string,
  query: AudioQuery,
  speaker: number,
  options: EngineOptions = {},
): Promise<Buffer> {
  const body = await engineFetch(
    baseUrl,
    `/synthesis?speaker=${speaker}`,
    options.timeoutMs ?? SYNTHESIS_TIMEOUT_MS,
    (res) => res.arrayBuffer(),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(query),
    },
  );
  return Buffer.from(body);
}

export function resolveStyleId(speakers: VoiceSpeaker[], speaker: string): number {
  const [name, styleName] = speaker.split("/");
  const found = speakers.find((entry) => entry.name === name);
  if (!found) {
    throw new DekError(`speaker "${speaker}" not found`, {
      hint: "run `dekc voice speakers`",
    });
  }
  const style = found.styles.find((entry) => entry.name === (styleName ?? found.styles[0]?.name));
  if (!style) {
    throw new DekError(`style "${speaker}" not found`, {
      hint: "run `dekc voice speakers`",
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

class EngineMissingError extends DekError {
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

/**
 * What the engine answers at `path`, read by `read` within `timeoutMs`. An engine that cannot be
 * reached is missing; one that is reached but does not answer in time is stuck, and says so.
 */
async function engineFetch<T>(
  baseUrl: string,
  path: string,
  timeoutMs: number,
  read: (res: Response) => Promise<T>,
  init?: RequestInit,
): Promise<T> {
  const signal = AbortSignal.timeout(timeoutMs);
  const timedOut = () =>
    new DekError(`voice engine did not answer ${path.split("?")[0]} within ${timeoutMs / 1000}s`, {
      hint: "check the engine log, and restart the engine if it is stuck, then run the command again",
    });
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, { ...init, signal });
  } catch {
    if (signal.aborted) {
      throw timedOut();
    }
    throw engineMissingError(engineNameForUrl(baseUrl) ?? "voice engine", baseUrl);
  }
  if (!res.ok) {
    throw new DekError(`voice engine returned ${res.status} for ${path}`, {
      hint: "check the engine log",
    });
  }
  try {
    return await read(res);
  } catch (error) {
    if (signal.aborted) {
      throw timedOut();
    }
    throw error;
  }
}
