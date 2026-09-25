import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { DekError } from "./error.ts";
import { isPinnedRev, isPlainRefName } from "./ref-name.ts";
import { configHint, formatZodIssues, parseFailure } from "./zod.ts";

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
  refs: z
    .record(z.string(), z.string())
    .superRefine((refs, ctx) => {
      for (const [name, rev] of Object.entries(refs)) {
        if (!isPlainRefName(name)) {
          ctx.addIssue({ code: "custom", path: [name], message: "a ref is named owner/repo/deck" });
        } else if (!isPinnedRev(rev)) {
          ctx.addIssue({
            code: "custom",
            path: [name],
            message: `pin a ref to a 40-character commit sha; run \`dek ref ${name}\` to pin one`,
          });
        }
      }
    })
    .optional(),
});

/** Every key dek.toml may hold, as dotted paths; `refs` takes any key below it. */
export const DEK_TOML_KEYS = {
  keys: [
    ...Object.keys(DekToml.shape),
    ...Object.keys(DekToml.shape.voice.unwrap().shape).map((key) => `voice.${key}`),
  ],
  openTables: ["refs"],
};

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
  /** `[refs]`: each ref name and the commit it is pinned to. */
  refs?: Record<string, string>;
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
    const failure = parseFailure(error);
    throw new DekError(`invalid dek.toml: ${failure.text}`, {
      ...(failure.line ? { line: failure.line } : {}),
      path,
      cause: error,
      hint: configHint("dek-toml"),
    });
  }

  const result = DekToml.safeParse(parsed ?? {});
  if (!result.success) {
    throw new DekError(formatZodIssues(result.error), { path, hint: configHint("dek-toml") });
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
    ...(result.data.refs && Object.keys(result.data.refs).length > 0
      ? { refs: result.data.refs }
      : {}),
  };
}

export function loadConfig(configPath: string): DekConfig {
  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }
  return parseDekToml(readFileSync(configPath, "utf8"), configPath);
}
