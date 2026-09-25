import { parseArgs } from "node:util";
import { DekError } from "../core/error.ts";

/** Every flag dek has, with its shape; each command names the ones it takes. */
const FLAGS = {
  json: { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
  agent: { type: "boolean" },
  deck: { type: "string" },
  "theme-from": { type: "string" },
  remote: { type: "boolean" },
  port: { type: "string" },
  fix: { type: "boolean" },
  visual: { type: "boolean" },
  shot: { type: "boolean" },
  voice: { type: "boolean" },
  format: { type: "string" },
  before: { type: "string" },
  after: { type: "string" },
  step: { type: "string" },
  to: { type: "string" },
  at: { type: "string" },
  accent: { type: "string" },
  fps: { type: "string" },
  "root-dist": { type: "boolean" },
  url: { type: "string" },
} as const satisfies Record<string, { type: "boolean" | "string"; short?: string }>;

export type FlagName = keyof typeof FLAGS;

/**
 * Taken by every invocation: --json also shapes an error, and --help and --version turn any
 * command line into help or the version.
 */
const GLOBAL_FLAGS: readonly FlagName[] = ["json", "help", "version"];

/**
 * What each command takes on top of the global flags. `serve` is the bare
 * `dek [deck]`; an unknown word is parsed as a deck name and judged later.
 */
export const COMMAND_FLAGS = {
  help: ["agent"],
  init: ["deck"],
  new: ["theme-from"],
  ls: ["deck"],
  ref: [],
  show: ["deck"],
  theme: ["deck"],
  sync: ["deck"],
  lint: ["deck", "fix", "visual", "format"],
  mv: ["deck", "before", "after"],
  build: ["deck", "root-dist", "url"],
  check: ["deck", "shot", "voice"],
  goto: ["deck"],
  current: ["deck"],
  shot: ["deck", "step", "to", "at"],
  pdf: ["deck", "root-dist"],
  cues: ["deck"],
  voice: ["deck", "accent"],
  video: ["deck", "fps", "root-dist"],
  rehearse: ["deck", "remote"],
  serve: ["deck", "remote", "visual", "port"],
} as const satisfies Record<string, readonly FlagName[]>;

export type CommandName = keyof typeof COMMAND_FLAGS;

export type FlagValues = { [name in FlagName]?: string | boolean };

export type CommandLine = {
  /** The first word: a command, a deck name, or nothing for the bare `dek`. */
  command?: string;
  positionals: string[];
  values: FlagValues;
};

function isCommandName(word: string | undefined): word is CommandName {
  return word !== undefined && Object.hasOwn(COMMAND_FLAGS, word);
}

function optionsFor(names: readonly FlagName[]): Partial<typeof FLAGS> {
  return Object.fromEntries(names.map((name) => [name, FLAGS[name]]));
}

/**
 * argv after `dek`, checked against the flags its command takes. Two passes:
 * a lenient one only to find the command word (value flags must consume their
 * value first, or `--deck talk ls` would read `talk` as the command), then a
 * strict one with that command's flags, so a typo or a flag from another
 * command is an error instead of a silent no-op.
 */
export function parseCommandLine(argv: string[]): CommandLine {
  const lenient = parseArgs({
    args: argv,
    options: FLAGS,
    strict: false,
    allowPositionals: true,
  });
  const command = lenient.positionals[0];
  const spec =
    lenient.values.help === true && !isCommandName(command)
      ? "help"
      : isCommandName(command)
        ? command
        : "serve";
  const names = [...GLOBAL_FLAGS, ...COMMAND_FLAGS[spec]];
  const label = command === undefined ? "dek" : `dek ${command}`;

  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      options: optionsFor(names),
      strict: true,
      allowPositionals: true,
    });
  } catch (error) {
    throw describeParseError(error, { argv, label, names });
  }
  return { command, positionals: parsed.positionals, values: parsed.values as FlagValues };
}

function usageHint(label: string, names: readonly FlagName[]): string {
  return `${label} takes ${names.map((name) => `--${name}`).join(", ")}; run \`dek help --agent\``;
}

/** parseArgs' own messages, reworded around what the user typed. */
function describeParseError(
  error: unknown,
  { argv, label, names }: { argv: string[]; label: string; names: readonly FlagName[] },
): DekError {
  const message = error instanceof Error ? error.message : String(error);
  const hint = usageHint(label, names);
  const unknown = message.match(/^Unknown option '([^']+)'/);
  if (unknown) {
    return new DekError(`unknown flag ${unknown[1]} for ${label}`, { hint });
  }
  const missing = message.match(/^Option '(--[^ ']+)(?: <value>)?' argument missing/);
  if (missing) {
    return new DekError(`${missing[1]} needs a value`, { hint });
  }
  // `--to --deck`: parseArgs refuses to guess; say what it saw instead of a value.
  const ambiguous = message.match(/^Option '(--[^']+)' argument is ambiguous/);
  if (ambiguous) {
    const next = argv[argv.indexOf(ambiguous[1] ?? "") + 1];
    return new DekError(`${ambiguous[1]} needs a value, got ${next}`, { hint });
  }
  const extra = message.match(/^Option '(--[^']+)' does not take an argument/);
  if (extra) {
    return new DekError(`${extra[1]} takes no value`, { hint });
  }
  return new DekError(message, { hint });
}
