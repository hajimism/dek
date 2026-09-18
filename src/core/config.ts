import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { DekError } from "./error.ts";

const DekToml = z.object({
  max_classes: z.number().optional(),
  cjk_per_minute: z.number().optional(),
  latin_per_minute: z.number().optional(),
  voice: z
    .object({
      engine: z.string().optional(),
      speaker: z.string(),
      speed: z.number().optional(),
    })
    .optional(),
});

export type VoiceDefaults = {
  engine: string;
  speaker: string;
  speed: number;
};

export type DekConfig = {
  maxClasses: number;
  cjkPerMinute: number;
  latinPerMinute: number;
  voice?: VoiceDefaults;
};

export const DEFAULT_CONFIG: DekConfig = {
  maxClasses: 40,
  cjkPerMinute: 300,
  latinPerMinute: 130,
};

export function parseDekToml(source: string, path?: string): DekConfig {
  let parsed: unknown;
  try {
    parsed = Bun.TOML.parse(source);
  } catch (error) {
    throw new DekError("invalid dek.toml", { path, cause: error });
  }

  const result = DekToml.safeParse(parsed ?? {});
  if (!result.success) {
    throw new DekError(result.error.message, { path });
  }

  const voice = result.data.voice
    ? {
        engine: result.data.voice.engine ?? "voicevox",
        speaker: result.data.voice.speaker,
        speed: result.data.voice.speed ?? 1,
      }
    : undefined;

  return {
    maxClasses: result.data.max_classes ?? DEFAULT_CONFIG.maxClasses,
    cjkPerMinute: result.data.cjk_per_minute ?? DEFAULT_CONFIG.cjkPerMinute,
    latinPerMinute: result.data.latin_per_minute ?? DEFAULT_CONFIG.latinPerMinute,
    ...(voice ? { voice } : {}),
  };
}

export function loadConfig(configPath: string): DekConfig {
  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }
  return parseDekToml(readFileSync(configPath, "utf8"), configPath);
}
