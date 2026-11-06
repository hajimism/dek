import type { PluginManifest, PluginRules } from "../../plugin-api.ts";

/**
 * The one place each rule is declared: the manifest prints it, and a finding can name only a rule
 * here, so dek-words cannot report an id its manifest does not declare.
 */
const RULES = {
  WORDS001: { severity: "warning", summary: "a word on the project's word list is in the deck" },
  WORDS002: { severity: "error", summary: "the word list or a deck's allows cannot be read" },
} as const satisfies PluginRules<"WORDS">;

export type RuleId = keyof typeof RULES;

/** The project's list, in `plugins/words/` (ADR 35). */
export const LIST_FILE = "words.yaml";

/** The list as an agent finds it, from the project's root. */
export const LIST_PATH = `plugins/words/${LIST_FILE}`;

/** The words a deck allows, in its folder. */
export const ALLOW_FILE = "words.yaml";

/**
 * dek-words' own version, apart from dek's: a project accepts a change to what it promises, and
 * a dek release that leaves the rules as they were must not ask for that.
 */
const VERSION = "0.1.0";

/** What `dek-words manifest` prints: the same every time, since dek pins it. */
export const MANIFEST = {
  schema: 1,
  name: "words",
  version: VERSION,
  check: { protocol: 1, rules: RULES },
  data: [{ path: LIST_FILE, in: "project" }, { path: ALLOW_FILE }],
} as const satisfies PluginManifest<"WORDS">;
