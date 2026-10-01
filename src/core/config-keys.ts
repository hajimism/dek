import { DekcToml, Voice } from "./config.ts";
import { splitLines } from "./lines.ts";
import { readFrontmatterYaml } from "./parse.ts";
import { Frontmatter } from "./schema.ts";
import { suggest } from "./suggest.ts";
import { scanTomlKeys } from "./toml-keys.ts";
import { unrecognizedKeys } from "./zod.ts";

/** A key dekc does not read, where it is, and the known key it most likely meant. */
export type UnknownKey = { key: string; line: number; suggestion?: string };

/** dekc.toml's schema, but a key it does not read is an issue; `refs` still takes any key. */
const StrictDekcToml = DekcToml.extend({ voice: Voice.strict().optional() }).strict();

/** Every key dekc.toml may hold, as dotted paths. */
const DEKC_TOML_KEYS: readonly string[] = [
  ...Object.keys(DekcToml.shape),
  ...Object.keys(Voice.shape).map((key) => `voice.${key}`),
];

export const FRONTMATTER_KEYS: readonly string[] = Object.keys(Frontmatter.shape);

/**
 * Keys in dekc.toml that dekc ignores. Parsing drops unknown keys without a word, so a typo such
 * as `latin_per_minut` would silently leave the default in place. The schema decides what is
 * unknown, inline tables such as `voice = { sped = 1 }` included; the scan only says where. A
 * file that does not parse has none: loading it reports that.
 */
export function unknownTomlKeys(source: string): UnknownKey[] {
  let parsed: unknown;
  try {
    parsed = Bun.TOML.parse(source);
  } catch {
    return [];
  }
  const unread = unrecognizedKeys(StrictDekcToml, parsed ?? {});
  if (unread.length === 0) {
    return [];
  }
  const scanned = scanTomlKeys(source);
  return unread
    .map((path) => {
      const key = path.join(".");
      const written =
        scanned.find((entry) => entry.path.join(".") === key) ??
        scanned.find((entry) => entry.path.join(".").startsWith(`${key}.`));
      return withSuggestion({ key, line: written?.line ?? 1 }, DEKC_TOML_KEYS);
    })
    .sort((a, b) => a.line - b.line);
}

/**
 * Top-level frontmatter keys dekc ignores, with 1-based lines in script.md; `firstLine` is the line
 * the YAML starts on, right after the opening `---`. The schema decides what is unknown, as it
 * does for dekc.toml; YAML that does not parse has none, since the deck then fails to load.
 */
export function unknownFrontmatterKeys(yaml: string, firstLine: number): UnknownKey[] {
  let parsed: unknown;
  try {
    parsed = readFrontmatterYaml(yaml);
  } catch {
    return [];
  }
  const lines = splitLines(yaml);
  return unrecognizedKeys(Frontmatter.strict(), parsed ?? {})
    .map(([key = ""]) => {
      const index = lines.findIndex((text) => topLevelKey(text) === key);
      return withSuggestion({ key, line: firstLine + Math.max(0, index) }, FRONTMATTER_KEYS);
    })
    .sort((a, b) => a.line - b.line);
}

/** The key a top-level YAML line writes, quoted or not. */
function topLevelKey(text: string): string | undefined {
  const match = text.match(/^(?:"([^"]*)"|'([^']*)'|([A-Za-z_][\w-]*))\s*:/);
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function withSuggestion(entry: UnknownKey, known: readonly string[]): UnknownKey {
  const suggestion = suggest(entry.key, [...known]);
  return suggestion ? { ...entry, suggestion } : entry;
}
