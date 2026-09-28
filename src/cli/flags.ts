import { parseArgs } from "node:util";
import { DekError } from "../core/error.ts";
import { acceptedFlags, isTypedCommand, subcommandAt } from "./commands.ts";

/** A flag's shape: a switch, a string, or a value dek checks before any command runs. */
type FlagSpec = { text: string } & (
  | { type: "boolean"; short?: string }
  | { type: "string"; value: string }
  | { type: "int"; value: string; min: number; max?: number; example: string }
  | { type: "number"; value: string; above: number; example: string }
  | { type: "enum"; choices: readonly string[]; example: string; note?: string }
);

/**
 * Every flag dek has: its type, the placeholder for its value, and what it means. Each command
 * names the ones it takes; help, parsing, and the checks on a value all read this one table.
 */
export const FLAGS = {
  json: { type: "boolean", text: "print the result, or the error, as JSON" },
  help: { type: "boolean", short: "h", text: "show help; dek help <command> for one command" },
  version: { type: "boolean", short: "v", text: "print the dek version" },
  agent: { type: "boolean", text: "the compact reference for agents" },
  deck: { type: "string", value: "NAME", text: "target a deck by name from the project root" },
  "theme-from": {
    type: "string",
    value: "DECK",
    text: "copy that deck's theme.css instead of the project's",
  },
  remote: {
    type: "boolean",
    text: "serve on the LAN; the presenter view needs the password dek prints",
  },
  port: {
    type: "int",
    value: "N",
    min: 1,
    max: 65_535,
    example: "dek --port 3030",
    text: "listen on this port (the OS picks one when omitted)",
  },
  fix: { type: "boolean", text: "create missing skeleton slides before linting" },
  visual: {
    type: "boolean",
    text: "add the rendered rules: overflow and contrast (needs Playwright)",
  },
  shot: { type: "boolean", text: "also write a screenshot and return its path" },
  voice: { type: "boolean", text: "also return each sentence's reading and duration" },
  format: {
    type: "enum",
    choices: ["sarif"],
    example: "dek lint --format sarif",
    note: "for JSON, pass --json",
    text: "print diagnostics as SARIF",
  },
  before: { type: "string", value: "SLUG", text: "move the section before this one" },
  after: { type: "string", value: "SLUG", text: "move the section after this one" },
  step: { type: "string", value: "ID|N", text: "the beat to capture (default: the last)" },
  to: { type: "string", value: "SLUG", text: "capture the transition into this slide" },
  // A string: core/shot.ts reads and checks it, as the one place that knows the range.
  at: {
    type: "string",
    value: "0..1",
    text: "how far into the view transition (default 0.5); the slide's own entrance can run on past 1",
  },
  sheet: { type: "boolean", text: "tile every slide on contact sheets an agent reads in one look" },
  motion: {
    type: "boolean",
    text: "a row for the arrival and each beat, held at moments through all it moves, ending as shot does",
  },
  accent: {
    type: "int",
    value: "N",
    min: 0,
    example: "dek voice dict add dek デック --accent 1",
    text: "the accent position of the reading",
  },
  fps: {
    type: "number",
    value: "N",
    above: 0,
    example: "dek video --fps 30",
    text: "frames per second",
  },
  "root-dist": { type: "boolean", text: "write to <root>/dist/ instead of the deck's dist/" },
  url: {
    type: "string",
    value: "<url>",
    text: "the URL dist/ is served from, over url in dek.toml",
  },
} as const satisfies Record<string, FlagSpec>;

export type FlagName = keyof typeof FLAGS;

type ValueOf<F> = F extends { type: "boolean" }
  ? true
  : F extends { type: "int" | "number" }
    ? number
    : F extends { choices: readonly (infer C)[] }
      ? C
      : string;

/** What the command line said, each value already of its flag's type. */
export type FlagValues = { -readonly [K in FlagName]?: ValueOf<(typeof FLAGS)[K]> };

/**
 * Taken by every invocation: --json also shapes an error, and --help and --version turn any
 * command line into help or the version.
 */
const GLOBAL_FLAGS: readonly FlagName[] = ["json", "help", "version"];

/** The placeholder help prints after a flag, or nothing for a switch. */
export function flagValue(name: FlagName): string | undefined {
  const flag: FlagSpec = FLAGS[name];
  if (flag.type === "boolean") {
    return undefined;
  }
  return flag.type === "enum" ? flag.choices.join("|") : flag.value;
}

type ParseOptions = Record<string, { type: "boolean" | "string"; short?: string }>;

function parseOptions(names: readonly FlagName[]): ParseOptions {
  return Object.fromEntries(
    names.map((name) => {
      const flag: FlagSpec = FLAGS[name];
      const type = flag.type === "boolean" ? "boolean" : "string";
      return [name, flag.type === "boolean" && flag.short ? { type, short: flag.short } : { type }];
    }),
  );
}

const ALL_FLAGS = Object.keys(FLAGS) as FlagName[];

export type CommandLine = {
  /** The first word: a command, a deck name, or nothing for the bare `dek`. */
  command?: string;
  /** The subcommand named, such as `dict add` for `dek voice dict add`. */
  subcommand?: string;
  /** Every word that is no flag, the command word first. */
  positionals: string[];
  values: FlagValues;
};

function lenientParse(argv: string[]) {
  return parseArgs({
    args: argv,
    options: parseOptions(ALL_FLAGS),
    strict: false,
    allowPositionals: true,
  });
}

/** Whether argv asks for JSON, read even from a command line too broken to parse. */
export function wantsJson(argv: string[]): boolean {
  return lenientParse(argv).values.json === true;
}

/**
 * argv after `dek`, checked against the flags its command takes. Two passes:
 * a lenient one only to find the command word (value flags must consume their
 * value first, or `--deck talk ls` would read `talk` as the command), then a
 * strict one with that command's flags, so a typo or a flag from another
 * command is an error instead of a silent no-op. A value that does not fit its
 * flag is refused here too, before any command runs.
 */
export function parseCommandLine(argv: string[]): CommandLine {
  const lenient = lenientParse(argv);
  const command = lenient.positionals[0];
  // An unknown word, `serve` included, is parsed as the bare `dek [deck]` and judged later.
  const name =
    lenient.values.help === true && !isTypedCommand(command)
      ? "help"
      : isTypedCommand(command)
        ? command
        : "serve";
  const sub = subcommandAt(name, lenient.positionals);
  const names = [...acceptedFlags(name, sub?.name), ...GLOBAL_FLAGS];
  const label = [command === undefined ? "dek" : `dek ${command}`, sub?.name]
    .filter(Boolean)
    .join(" ");
  const hint = `${label} takes ${names.map((flag) => `--${flag}`).join(", ")}; run \`dek help ${name}\``;

  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      options: parseOptions(names),
      strict: true,
      allowPositionals: true,
    });
  } catch (error) {
    throw describeParseError(error, { argv, label, hint });
  }
  return {
    command,
    ...(sub ? { subcommand: sub.name } : {}),
    positionals: parsed.positionals,
    values: typedValues(parsed.values as Record<string, string | boolean>),
  };
}

function typedValues(raw: Record<string, string | boolean>): FlagValues {
  const values: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(raw)) {
    values[name] = typeof value === "string" ? typedValue(name as FlagName, value) : value;
  }
  return values as FlagValues;
}

/** A flag's value as its type, or the error that says what it may be. */
function typedValue(name: FlagName, value: string): string | number {
  const flag: FlagSpec = FLAGS[name];
  switch (flag.type) {
    case "boolean":
    case "string":
      return value;
    case "int": {
      const n = /^-?\d+$/.test(value) ? Number(value) : Number.NaN;
      if (Number.isInteger(n) && n >= flag.min && (flag.max === undefined || n <= flag.max)) {
        return n;
      }
      const range =
        flag.max === undefined ? `of ${flag.min} or more` : `from ${flag.min} to ${flag.max}`;
      throw invalid(name, value, `a whole number ${range}, e.g. \`${flag.example}\``);
    }
    case "number": {
      // Number("") is 0, so an empty value is refused before it can pass as one.
      const n = value.trim() === "" ? Number.NaN : Number(value);
      if (Number.isFinite(n) && n > flag.above) {
        return n;
      }
      throw invalid(name, value, `a number above ${flag.above}, e.g. \`${flag.example}\``);
    }
    case "enum": {
      if (flag.choices.includes(value)) {
        return value;
      }
      const note = flag.note ? `; ${flag.note}` : "";
      throw invalid(name, value, `${flag.choices.join(" or ")}, e.g. \`${flag.example}\`${note}`);
    }
  }
}

function invalid(name: FlagName, value: string, takes: string): DekError {
  return new DekError(`invalid --${name} "${value}"`, { hint: `--${name} takes ${takes}` });
}

/** parseArgs' own messages, reworded around what the user typed. */
function describeParseError(
  error: unknown,
  { argv, label, hint }: { argv: string[]; label: string; hint: string },
): DekError {
  const message = error instanceof Error ? error.message : String(error);
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
