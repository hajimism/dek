import { dirname } from "node:path";
import { z } from "zod";
import { DekError } from "./error.ts";
import { shellQuote } from "./escape.ts";
import { isPackLicense, PACK_LICENSES, type PackLicense } from "./licenses.ts";
import { parsePublicUrl } from "./ogp.ts";
import {
  isPinFor,
  isPlainRefName,
  packFile,
  parseRefSource,
  REF_DECK_NAME_RULE,
} from "./ref-name.ts";
import { readSourceIfExists } from "./safe-fs.ts";
import { DeckSettings } from "./schema.ts";
import { scanTomlKeys } from "./toml-keys.ts";
import { parseTomlWith } from "./zod.ts";

export const Voice = z.object({
  engine: z.string().optional(),
  speaker: z.string(),
  speed: z.number().optional(),
});

export const Pack = z.object({
  license: z
    .string()
    .refine(isPackLicense, {
      message: `write ${PACK_LICENSES.join(" or ")}, or delete the line and put a LICENSE at the project root`,
    })
    .optional(),
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
  pack: Pack.optional(),
  // Each key is checked before its value, so a key that names no ref is never repeated.
  refs: z
    .record(z.string(), z.unknown())
    .superRefine((refs, ctx) => {
      for (const [name, rev] of Object.entries(refs)) {
        if (!isPlainRefName(name)) {
          ctx.addIssue({
            code: "custom",
            path: [],
            message: `${REFUSED_REF_KEY}; ${REFUSED_REF_HINT}`,
          });
          continue;
        }
        const source = parseRefSource(name);
        if (typeof rev === "string" && isPinFor(source, rev)) {
          continue;
        }
        ctx.addIssue({
          code: "custom",
          path: [name],
          message:
            source.kind === "file"
              ? `pin a pack's ref to the 64-character sha256 of its files; run \`dekc ref ${shellQuote(packFile(source.deck))}\` to pin one`
              : `pin a ref to a 40-character commit sha; run \`dekc ref ${shellQuote(name)}\` to pin one`,
        });
      }
    })
    .transform((refs) => refs as Record<string, string>)
    .optional(),
});

const REFUSED_REF_KEY = "a key in [refs] names no ref";

const REFUSED_REF_HINT = `delete that line, and for a pack its packs/<deck>.tgz and refs/file/<deck>, then pin the deck again under a name a ref can carry: a ref is named owner/repo/deck, or file/<deck> for a pack, and ${REF_DECK_NAME_RULE}`;

/**
 * The first key in [refs] that names no ref, by its line when the file says it plainly. Such a
 * key may be someone else's text, from a project cloned or a pack added before dek checked it, so
 * the error points at it and never repeats it.
 */
function refusedRefKey(source: string): { line?: number } | undefined {
  let parsed: unknown;
  try {
    parsed = Bun.TOML.parse(source);
  } catch {
    return undefined;
  }
  const refs = (parsed as { refs?: unknown } | null)?.refs;
  const name =
    refs !== null && typeof refs === "object"
      ? Object.keys(refs).find((key) => !isPlainRefName(key))
      : undefined;
  if (name === undefined) {
    return undefined;
  }
  const written = scanTomlKeys(source).filter(
    (entry) => entry.path[0] === "refs" && entry.path.length === 2,
  );
  // A key written with escapes reads differently on its line; any key there that names no ref is it.
  const entry =
    written.find((key) => key.path[1] === name) ??
    written.find((key) => !isPlainRefName(key.path[1] ?? ""));
  return entry === undefined ? {} : { line: entry.line };
}

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
  /** `[pack]`: what `dekc pack` hands a deck over with, the license it carries. */
  pack?: { license?: PackLicense };
  /** `[refs]`: each ref name and what it is pinned to: a commit, or a pack's digest. */
  refs?: Record<string, string>;
};

export function parseDekToml(source: string, path?: string): DekConfig {
  const refused = refusedRefKey(source);
  if (refused) {
    throw new DekError(REFUSED_REF_KEY, { path, ...refused, hint: REFUSED_REF_HINT });
  }
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
    ...(data.pack
      ? { pack: data.pack.license ? { license: data.pack.license as PackLicense } : {} }
      : {}),
    ...(data.refs && Object.keys(data.refs).length > 0 ? { refs: data.refs } : {}),
  };
}

/** The project's dek.toml, which sits at its root; a link out of the project is an error. */
export function loadConfig(configPath: string): DekConfig {
  const source = readSourceIfExists(configPath, dirname(configPath));
  return source === undefined ? {} : parseDekToml(source, configPath);
}
