import {
  FRONTMATTER_KEYS,
  type UnknownKey,
  unknownFrontmatterKeys,
  unknownTomlKeys,
} from "../config-keys.ts";
import { type Diagnostic, diag } from "../diagnostic.ts";
import { readFrontmatterYaml } from "../parse.ts";
import { type Project, readTextIfExists } from "../resolve.ts";
import type { DeckSettings } from "../schema.ts";
import type { LintContext } from "./context.ts";

/*
 * DEK008: a key in dek.toml or the frontmatter that dek does not read. Parsing drops it
 * without a word, so a typo leaves the default in place and nobody knows why.
 */

/** DEK008 for dek.toml: a project finding, the same for every deck. */
export function tomlKeyDiagnostics(project: Project): Diagnostic[] {
  return unknownTomlKeys(readTextIfExists(project.configPath) ?? "").map((key) =>
    unknownKeyDiagnostic(key, { file: "dek.toml", path: project.configPath }),
  );
}

/** DEK008 for the deck's frontmatter. */
export function frontmatterKeyDiagnostics(ctx: LintContext): Diagnostic[] {
  const { deck, script } = ctx;
  return [
    ...(script ? unknownFrontmatterKeys(script.yaml, 2) : []).map((key) =>
      unknownKeyDiagnostic(key, { file: "frontmatter", path: deck.scriptPath }),
    ),
    ...unfollowedSeedDiagnostics(ctx),
  ];
}

/**
 * DEK008 for a deck setting dek.toml sets and the deck leaves out. dek.toml only seeds `dekc new`,
 * so a deck made before it, or without the key, keeps the default: said where the key would go,
 * and only when the two differ, since otherwise the verdict is the same either way.
 */
function unfollowedSeedDiagnostics({ config, deck, script }: LintContext): Diagnostic[] {
  if (!script || !config.seed) {
    return [];
  }
  const written = readFrontmatterKeys(script.yaml);
  return Object.entries(config.seed).flatMap(([key, value]) => {
    const used = deck.deck[key as keyof DeckSettings];
    if (written.has(key) || value === used) {
      return [];
    }
    return [
      diag("DEK008", {
        message: `dek.toml sets ${key} = ${value}, which this deck does not follow; it uses ${used}`,
        path: deck.scriptPath,
        line: script.bodyStartLine - 1,
        hint: `to keep ${value}, add \`${key}: ${value}\` to the frontmatter; dek.toml only seeds \`dekc new\``,
        data: { file: "frontmatter", key, value },
      }),
    ];
  });
}

/** The top-level keys the frontmatter writes; none when its YAML does not parse. */
function readFrontmatterKeys(yaml: string): Set<string> {
  try {
    const parsed = readFrontmatterYaml(yaml);
    return new Set(parsed && typeof parsed === "object" ? Object.keys(parsed) : []);
  } catch {
    return new Set();
  }
}

function unknownKeyDiagnostic(
  { key, line, suggestion }: UnknownKey,
  where: { file: "dek.toml" | "frontmatter"; path: string },
): Diagnostic {
  const place = where.file === "dek.toml" ? "dek.toml" : "the frontmatter";
  const known =
    where.file === "dek.toml"
      ? `see ${REFERENCE_URL}#dek-toml`
      : `the keys are ${FRONTMATTER_KEYS.join(", ")}; see ${REFERENCE_URL}#frontmatter`;
  return diag("DEK008", {
    message: `unknown key ${key} in ${place}; dek ignores it`,
    path: where.path,
    line,
    hint: suggestion ? `did you mean ${suggestion}?` : known,
    data: { file: where.file, key, ...(suggestion ? { suggestion } : {}) },
  });
}

const REFERENCE_URL = "https://hajimism.github.io/dek/reference/config.html";
