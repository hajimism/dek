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
export function frontmatterKeyDiagnostics({ deck, script }: LintContext): Diagnostic[] {
  return (script ? unknownFrontmatterKeys(script.yaml, 2) : []).map((key) =>
    unknownKeyDiagnostic(key, { file: "frontmatter", path: deck.scriptPath }),
  );
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
