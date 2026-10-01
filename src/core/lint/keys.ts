import {
  FRONTMATTER_KEYS,
  type UnknownKey,
  unknownFrontmatterKeys,
  unknownTomlKeys,
} from "../config-keys.ts";
import { type Diagnostic, diag } from "../diagnostic.ts";
import { type Project, readTextIfExists } from "../resolve.ts";
import type { LintContext } from "./context.ts";

/*
 * DEKC008: a key in dekc.toml or the frontmatter that dekc does not read. Parsing drops it
 * without a word, so a typo leaves the default in place and nobody knows why.
 */

/** DEKC008 for dekc.toml: a project finding, the same for every deck. */
export function tomlKeyDiagnostics(project: Project): Diagnostic[] {
  return unknownTomlKeys(readTextIfExists(project.configPath) ?? "").map((key) =>
    unknownKeyDiagnostic(key, { file: "dekc.toml", path: project.configPath }),
  );
}

/** DEKC008 for the deck's frontmatter. */
export function frontmatterKeyDiagnostics({ deck, script }: LintContext): Diagnostic[] {
  return (script ? unknownFrontmatterKeys(script.yaml, 2) : []).map((key) =>
    unknownKeyDiagnostic(key, { file: "frontmatter", path: deck.scriptPath }),
  );
}

function unknownKeyDiagnostic(
  { key, line, suggestion }: UnknownKey,
  where: { file: "dekc.toml" | "frontmatter"; path: string },
): Diagnostic {
  const place = where.file === "dekc.toml" ? "dekc.toml" : "the frontmatter";
  const known =
    where.file === "dekc.toml"
      ? `see ${REFERENCE_URL}#dekc-toml`
      : `the keys are ${FRONTMATTER_KEYS.join(", ")}; see ${REFERENCE_URL}#frontmatter`;
  return diag("DEKC008", {
    message: `unknown key ${key} in ${place}; dekc ignores it`,
    path: where.path,
    line,
    hint: suggestion ? `did you mean ${suggestion}?` : known,
    data: { file: where.file, key, ...(suggestion ? { suggestion } : {}) },
  });
}

const REFERENCE_URL = "https://hajimism.github.io/dekc/reference/config.html";
