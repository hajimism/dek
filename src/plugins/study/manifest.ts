import type { PluginManifest, PluginRules } from "../../plugin-api.ts";

/**
 * The one place each rule is declared: the manifest prints it, and a finding can name only a rule
 * here, so dek-study cannot report an id its manifest does not declare.
 */
const RULES = {
  STUDY001: { severity: "error", summary: "a sticker's words are not on its slide" },
  STUDY002: { severity: "warning", summary: "a sticker's words also show elsewhere on its slide" },
  STUDY003: { severity: "error", summary: "study.yaml cannot be read" },
} as const satisfies PluginRules<"STUDY">;

export type RuleId = keyof typeof RULES;

/** The file of stickers, in each deck's folder. */
export const STUDY_FILE = "study.yaml";

/**
 * dek-study's own version, apart from dek's: a project accepts a change to what it promises, and
 * a dek release that leaves the rules as they were must not ask for that.
 */
const VERSION = "0.1.0";

/** What `dek-study manifest` prints: the same every time, since dek pins it. */
export const MANIFEST = {
  schema: 1,
  name: "study",
  version: VERSION,
  check: { protocol: 1, rules: RULES },
  data: [{ path: STUDY_FILE }],
} as const satisfies PluginManifest<"STUDY">;
