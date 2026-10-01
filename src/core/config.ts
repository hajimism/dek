import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { parsePublicUrl } from "./ogp.ts";
import { isPinnedRev, isPlainRefName } from "./ref-name.ts";
import { DeckSettings } from "./schema.ts";
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
  ...DeckSettings.partial().shape,
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
            message: `pin a ref to a 40-character commit sha; run \`dekc ref ${name}\` to pin one`,
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
  /**
   * The deck settings `dekc new` writes into a new deck's frontmatter. Nothing else reads them: a
   * deck is judged by its own, so changing dek.toml leaves the decks already made as they were.
   */
  seed?: Partial<DeckSettings>;
  voice?: VoiceDefaults;
  /** `[refs]`: each ref name and the commit it is pinned to. */
  refs?: Record<string, string>;
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
  const seed = DeckSettings.partial().parse(data);
  return {
    ...(url ? { url } : {}),
    ...(Object.keys(seed).length > 0 ? { seed } : {}),
    ...(voice ? { voice } : {}),
    ...(data.refs && Object.keys(data.refs).length > 0 ? { refs: data.refs } : {}),
  };
}

export function loadConfig(configPath: string): DekConfig {
  if (!existsSync(configPath)) {
    return {};
  }
  return parseDekToml(readFileSync(configPath, "utf8"), configPath);
}
