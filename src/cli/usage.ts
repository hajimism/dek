import pkg from "../../package.json";
import { DekError } from "../core/error.ts";
import { suggest } from "../core/suggest.ts";
import {
  allSpecs,
  COMMANDS,
  type CommandName,
  commandFlags,
  formOf,
  type Group,
  isTypedCommand,
  subcommandsOf,
  usageLines,
} from "./commands.ts";
import { CLI_SCHEMA_URL } from "./contract.ts";
import { type CommandLine, FLAGS, type FlagName, flagValue } from "./flags.ts";

const GROUP_TITLES: Record<Group, string> = {
  Development: "Development",
  Project: "Project",
  Refs: "Refs (other people's decks to read as models; read-only)",
  Slide: "Slide",
  Output: "Output",
  Help: "Help",
};

/** A call and what it does, on one line when the call is short, else the text under it. */
function overviewLine([call, text]: readonly [string, string]): string {
  const column = 20;
  return call.length < column
    ? `  ${call.padEnd(column)}${text}`
    : `  ${call}\n${" ".repeat(column + 2)}${text}`;
}

/** The commands that read a ref where they read a deck, as their specs say. */
function refReaders(): string[] {
  return allSpecs()
    .filter(([, spec]) => spec.refs === true)
    .map(([name]) => name);
}

/** `dekc help`: every command by group, in the order COMMANDS lists them. */
export function helpText(): string {
  const groups = new Map<Group, string[]>();
  for (const [, spec] of allSpecs()) {
    const lines = groups.get(spec.group) ?? [];
    lines.push(...spec.overview.map(overviewLine));
    groups.set(spec.group, lines);
  }
  groups
    .get("Refs")
    ?.push(
      overviewLine([`dekc ${refReaders().join("|")} <ref> ...`, "read a ref as you would a deck"]),
    );
  const body = [...groups].map(([group, lines]) => [GROUP_TITLES[group], ...lines].join("\n"));
  return `dek — a build system for talks

${body.join("\n\n")}

Commands that print a result accept --json. dek and dekc rehearse stay running.
Pass a deck name or --deck <name> to target a deck from the project root.
Flags are checked per command: an unknown flag is an error, not ignored.
dekc <command> --help  one command's usage and flags; dekc --version prints the version
dekc help --agent      compact command reference for agents
`;
}

/** `dekc help --agent`: one terse line or two per command. */
export function agentHelpText(): string {
  const lines = allSpecs().flatMap(([name, spec]) =>
    name === "ref"
      ? [
          ...spec.agent,
          `Refs are read-only decks to learn from: ${refReaders().join(", ")} take owner/repo/deck as the deck.`,
        ]
      : spec.agent,
  );
  return `dek — agent interface
Result commands accept --json. dekc / rehearse do not (long-running). Diagnostics: dekc lint --format sarif.
Each command's --json shape: ${CLI_SCHEMA_URL}
Each diagnostic has severity (error | warning) and data; only errors exit 1.
Scope: project root = all decks; deck dir = that deck; NAME or --deck NAME.

${lines.join("\n")}

Errors include hint with the next command to run.
`;
}

const DOCS_URL = "https://hajimism.github.io/dek/reference/cli.html";

/** `dekc help <command>`: its usage, what it does, and every flag it takes. */
export function commandHelp(command: CommandName): string {
  const flags: FlagName[] = [...commandFlags(command), "json", "help"];
  const label = (flag: FlagName): string => {
    if (flag === "help") {
      return "--help, -h";
    }
    const value = flagValue(flag);
    return value ? `--${flag} ${value}` : `--${flag}`;
  };
  const width = Math.max(...flags.map((flag) => label(flag).length)) + 3;
  const [first, ...more] = usageLines(command);
  return [
    `usage: ${first}`,
    ...more.map((line) => `       ${line}`),
    "",
    COMMANDS[command].summary,
    "",
    "flags",
    ...flags.map((flag) => `  ${label(flag).padEnd(width)}${FLAGS[flag].text}`),
    "",
    DOCS_URL,
  ].join("\n");
}

export type HelpRequest =
  | { kind: "version" }
  | { kind: "help"; topic?: CommandName; agent: boolean };

/**
 * Whether argv asks for help or the version instead of running a command.
 * `dekc help <word>` names a command, so a word that is none fails as `dekc <word>` would.
 */
export function helpRequest(line: CommandLine): HelpRequest | undefined {
  if (line.values.version === true) {
    return { kind: "version" };
  }
  const asked = line.command === "help" || line.values.help === true;
  if (!asked) {
    return undefined;
  }
  const word = line.command === "help" ? line.positionals[1] : line.command;
  const agent = line.values.agent === true;
  if (line.command !== "help") {
    return isTypedCommand(word) ? { kind: "help", topic: word, agent } : { kind: "help", agent };
  }
  const extra = line.positionals[2];
  if (extra !== undefined) {
    throw usageError("help", `unexpected argument "${extra}" for dekc help`);
  }
  if (word === undefined || word === "help") {
    return { kind: "help", agent };
  }
  // `serve` is no word to type, yet it is the topic for the bare `dekc [deck]`.
  if (isTypedCommand(word) || word === "serve") {
    return { kind: "help", topic: word, agent };
  }
  throw unknownCommandError(word, []);
}

export function versionText(): string {
  return `dekc ${pkg.version}`;
}

/** A word the user typed that is neither a command nor a deck, with the likeliest fix. */
export function unknownCommandError(word: string, decks: string[]): DekError {
  if (word === "serve") {
    return new DekError("unknown command: serve", {
      hint: "the dev server is the bare `dekc [deck]`: drop `serve`",
    });
  }
  const commands = allSpecs()
    .map(([name]) => name)
    .filter(isTypedCommand);
  const guess = suggest(word, [...commands, ...decks]);
  return new DekError(`unknown command: ${word}`, {
    hint: guess ? `did you mean \`dekc ${guess}\`?` : "run `dekc help` to see the commands",
  });
}

/**
 * A command line that does not fit the spec, with the usage the spec gives: a subcommand's
 * own, or the command's, narrowed to the lines that contain `match` when given.
 */
export function usageError(
  command: CommandName,
  message: string,
  options: { subcommand?: string; match?: string } = {},
): DekError {
  const lines = formOf(command, options.subcommand).usage.filter(
    (line) => options.match === undefined || line.includes(options.match),
  );
  return new DekError(message, {
    hint: `usage: ${lines.join(" | ")}; run \`dekc help ${command}\``,
  });
}

/** A word where a command takes a subcommand, with the likeliest one. */
export function unknownSubcommandError(command: CommandName, word: string): DekError {
  const subs = Object.keys(subcommandsOf(COMMANDS[command]));
  const guess = suggest(word, subs);
  return new DekError(`unknown subcommand "${word}" for dekc ${command}`, {
    hint: guess
      ? `did you mean \`dekc ${command} ${guess}\`?`
      : `dekc ${command} takes ${subs.join(", ")}; run \`dekc help ${command}\``,
  });
}
