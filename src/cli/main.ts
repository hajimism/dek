import { DekcError } from "../core/error.ts";
import { either } from "../core/prose.ts";
import { isRefName } from "../core/ref-name.ts";
import { resolveProject } from "../core/resolve.ts";
import { addressHint } from "./address.ts";
import {
  type AnySpec,
  type CliResult,
  COMMANDS,
  type CommandName,
  formOf,
  isTypedCommand,
  subcommandAt,
  subcommandsOf,
} from "./commands.ts";
import { shellQuote } from "./files.ts";
import { type CommandLine, parseCommandLine, wantsJson } from "./flags.ts";
import { writeFailure, writeSuccess } from "./result.ts";
import { DeckRequiredError, namesDeck, peelDeckArg, resolveTarget } from "./scope.ts";
import {
  agentHelpText,
  commandHelp,
  helpRequest,
  helpText,
  unknownCommandError,
  unknownSubcommandError,
  usageError,
  versionText,
} from "./usage.ts";

/** The decks a mistyped word may have meant; none outside a project. */
function knownDeckNames(cwd: string): string[] {
  try {
    return resolveProject(cwd).decks.map((deck) => deck.name);
  } catch {
    return [];
  }
}

/** Help or the version, when argv asks for either; whether it did. */
function writeHelp(line: CommandLine): boolean {
  const request = helpRequest(line);
  if (!request) {
    return false;
  }
  const text =
    request.kind === "version"
      ? versionText()
      : request.topic
        ? commandHelp(request.topic)
        : request.agent
          ? agentHelpText()
          : helpText();
  if (line.values.json === true) {
    const key = request.kind === "version" ? "version" : "help";
    process.stdout.write(`${JSON.stringify({ ok: true, [key]: text })}\n`);
  } else {
    process.stdout.write(`${text}\n`);
  }
  return true;
}

/** A command line matched to its spec: the form it runs, the deck it names, its arguments. */
export type Call = {
  name: CommandName;
  subcommand?: string;
  deck?: string;
  args: Record<string, string | undefined>;
};

/** Each word of a form's `args`, by name; a missing or extra word is a usage error. */
function bindArgs(
  words: string[],
  { name, subcommand }: { name: CommandName; subcommand?: string },
): Record<string, string | undefined> {
  const label = ["dekc", name === "serve" ? undefined : name, subcommand].filter(Boolean).join(" ");
  const args: Record<string, string | undefined> = {};
  let next = 0;
  for (const arg of formOf(name, subcommand).args) {
    const rest = arg.endsWith("...");
    const key = arg.replace(/\?$|\.\.\.$/, "");
    const value = (rest ? words.slice(next).join(" ") : words[next])?.trim() || undefined;
    next = rest ? words.length : next + 1;
    if (value === undefined && !arg.endsWith("?")) {
      throw usageError(name, `missing <${key}> for ${label}`, { subcommand });
    }
    args[key] = value;
  }
  const extra = words[next];
  if (extra !== undefined) {
    // A command whose own form takes no words takes a subcommand there.
    const subs = Object.keys(subcommandsOf(COMMANDS[name] as AnySpec));
    if (subcommand === undefined && next === 0 && subs.length > 0) {
      throw unknownSubcommandError(name, extra);
    }
    throw usageError(name, `unexpected argument "${extra}" for ${label}`, { subcommand });
  }
  return args;
}

/**
 * The command a line runs, the deck it names, and its arguments. A first word that is no command
 * is a deck for the bare `dekc [deck]`, or a mistake. A deck comes before a subcommand.
 */
export function bindCommandLine(cwd: string, line: CommandLine): Call {
  const { command, values, positionals } = line;
  if (command === undefined || !isTypedCommand(command)) {
    if (command !== undefined && !namesDeck(cwd, command)) {
      throw unknownCommandError(command, knownDeckNames(cwd));
    }
    return { name: "serve", args: bindArgs(positionals, { name: "serve" }) };
  }
  const spec = COMMANDS[command] as AnySpec;
  const sub = subcommandAt(command, positionals);
  let deck = values.deck;
  let words: string[];
  if (sub) {
    const before = positionals.slice(1, sub.at);
    words = positionals.slice(sub.at + sub.name.split(" ").length);
    if (before[0] !== undefined) {
      if (deck !== undefined) {
        throw usageError(command, `unexpected argument "${before[0]}" for dekc ${command}`, {
          subcommand: sub.name,
        });
      }
      deck = before[0];
    }
  } else {
    words = positionals.slice(1);
    if (spec.scope && deck === undefined) {
      const args = formOf(command).args;
      const peeled = peelDeckArg(cwd, words, {
        max: args.some((arg) => arg.endsWith("...")) ? Number.POSITIVE_INFINITY : args.length,
        subcommands: Object.keys(subcommandsOf(spec)).length > 0,
      });
      deck = peeled.deck;
      words = peeled.rest;
    }
  }
  return {
    name: command,
    ...(sub ? { subcommand: sub.name } : {}),
    ...(deck !== undefined ? { deck } : {}),
    args: bindArgs(words, { name: command, subcommand: sub?.name }),
  };
}

/** Resolve what the command's spec says it works on, then run it and print its result. */
async function run(cwd: string, line: CommandLine): Promise<void> {
  const call = bindCommandLine(cwd, line);
  const spec = COMMANDS[call.name] as AnySpec;
  if (spec.kind === "session" && line.values.json === true) {
    throw sessionJsonError(spec.bare ? "dekc" : `dekc ${call.name}`);
  }
  if (spec.refs && call.deck !== undefined && isRefName(call.deck)) {
    const { restoreRef } = await import("./ref.ts");
    await restoreRef(cwd, call.deck);
  }
  const scope = spec.scope;
  const target = scope
    ? retypedWithDeck(line, cwd, () =>
        resolveTarget(cwd, scope, {
          deck: call.deck,
          refs: spec.refs === true,
          unreadable: spec.unreadable === true,
        }),
      )
    : undefined;
  const form = formOf(call.name, call.subcommand);
  const ctx = { cwd, flags: line.values, args: call.args, target };
  const data = await form.run?.(ctx);
  if (spec.kind === "result") {
    writeSuccess({ command: call.name, data } as CliResult, {
      json: line.values.json === true,
      format: line.values.format,
      cwd,
      ...(target?.deck && {
        deck: { name: target.ref?.name ?? target.deck.name, dir: target.deck.dir },
      }),
    });
  }
}

/** Most decks a hint names a command for; past that, one and where the rest are listed. */
const NAMED_DECKS = 3;

/**
 * `resolve`, with a missing deck hinted as the line that was typed, the deck named where the
 * command takes it: one command per deck of the project, so the hint runs as written.
 */
function retypedWithDeck<T>(line: CommandLine, cwd: string, resolve: () => T): T {
  try {
    return resolve();
  } catch (error) {
    if (!(error instanceof DeckRequiredError)) {
      throw error;
    }
    const typed = `\`dekc ${line.typed.map(shellQuote).join(" ")}\``;
    const [first] = error.decks;
    const hint = !first
      ? "run `dekc new <name>` to make a deck"
      : error.decks.length > NAMED_DECKS
        ? `run ${addressHint(typed, first, cwd)}, or name another deck in place of ${first.name}; \`dekc ls\` lists them`
        : `run ${either(error.decks.map((deck) => addressHint(typed, deck, cwd)))}`;
    throw new DekcError(error.message, { hint, cause: error });
  }
}

/** A session prints no result, so --json has nothing to shape, and a reader would wait forever. */
function sessionJsonError(name: string): DekcError {
  return new DekcError(`${name} keeps running until stopped and prints no JSON`, {
    hint: "start it without --json and leave it running; for a result, run `dekc lint --json` or `dekc check <slug> --json`",
  });
}

/**
 * parse → help → bind the words to the spec → resolve its decks → run → print. Every failure
 * prints once, here: as JSON when the line asks for it, even a line too broken to parse.
 */
export async function main(argv: string[], cwd: string): Promise<void> {
  let json = wantsJson(argv);
  try {
    const line = parseCommandLine(argv);
    json = line.values.json === true;
    if (!writeHelp(line)) {
      await run(cwd, line);
    }
  } catch (error) {
    writeFailure(error, { json, cwd });
  }
}
