import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { parsePublicUrl } from "./ogp.ts";
import { isPinnedRev, isPlainRefName } from "./ref-name.ts";
import { parseTomlWith } from "./zod.ts";

export const Voice = z.object({
  engine: z.string().optional(),
  speaker: z.string(),
  speed: z.number().optional(),
});

export const DekToml = z.object({
  url: z
    .string()
    .refine((value) => parsePublicUrl(value) !== undefined, {
      message:
        "write the absolute http(s) URL dist/ is served from, like https://example.com/talks/",
    })
    .optional(),
  max_classes: z.number().optional(),
  cjk_per_minute: z.number().optional(),
  latin_per_minute: z.number().optional(),
  voice: Voice.optional(),
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

type VoiceDefaults = {
  engine: string;
  speaker: string;
  speed: number;
};

export type DekConfig = {
  /** Where dist/ is served from, ending in a slash; link previews need it for og:image. */
  url?: string;
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
  const data = parseTomlWith(DekToml, source, {
    label: "dek.toml",
    anchor: "dek-toml",
    ...(path === undefined ? {} : { path }),
  });
  const voice = data.voice
    ? {
        engine: data.voice.engine ?? "voicevox",
        speaker: data.voice.speaker,
        speed: data.voice.speed ?? 1,
      }
    : undefined;
  const url = data.url === undefined ? undefined : parsePublicUrl(data.url);
  return {
    ...(url ? { url } : {}),
    maxClasses: data.max_classes ?? DEFAULT_CONFIG.maxClasses,
    cjkPerMinute: data.cjk_per_minute ?? DEFAULT_CONFIG.cjkPerMinute,
    latinPerMinute: data.latin_per_minute ?? DEFAULT_CONFIG.latinPerMinute,
    ...(voice ? { voice } : {}),
    ...(data.refs && Object.keys(data.refs).length > 0 ? { refs: data.refs } : {}),
  };
}

export function loadConfig(configPath: string): DekConfig {
  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }
  return parseDekToml(readFileSync(configPath, "utf8"), configPath);
}
