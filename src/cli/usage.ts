import pkg from "../../package.json";
import { DekError } from "../core/error.ts";
import { suggest } from "../core/suggest.ts";
import { COMMAND_FLAGS, type CommandLine, type CommandName, type FlagName } from "./flags.ts";

/** What each flag means, and the placeholder for the value a string flag takes. */
export const FLAG_DOCS: Record<FlagName, { value?: string; text: string }> = {
  json: { text: "print the result, or the error, as JSON" },
  help: { text: "show help; dek help <command> for one command" },
  version: { text: "print the dek version" },
  agent: { text: "the compact reference for agents" },
  deck: { value: "NAME", text: "target a deck by name from the project root" },
  "theme-from": { value: "DECK", text: "copy that deck's theme.css instead of the project's" },
  remote: { text: "serve on the LAN; the presenter view needs the password dek prints" },
  port: { value: "N", text: "listen on this port (the OS picks one when omitted)" },
  fix: { text: "create missing skeleton slides before linting" },
  visual: { text: "add the rendered rules: overflow and contrast (needs Playwright)" },
  shot: { text: "also write a screenshot and return its path" },
  voice: { text: "also return each sentence's reading and duration" },
  format: { value: "sarif", text: "print diagnostics as SARIF" },
  before: { value: "SLUG", text: "move the section before this one" },
  after: { value: "SLUG", text: "move the section after this one" },
  step: { value: "ID|N", text: "the beat to capture (default: the last)" },
  to: { value: "SLUG", text: "capture the transition into this slide" },
  at: { value: "0..1", text: "how far into the transition (default 0.5)" },
  accent: { value: "N", text: "the accent position of the reading" },
  fps: { value: "N", text: "frames per second" },
  "root-dist": { text: "write to <root>/dist/ instead of the deck's dist/" },
  url: { value: "<url>", text: "the URL dist/ is served from, over url in dek.toml" },
};

type CommandDoc = { usage: string[]; summary: string };

/** One entry per command: how to call it and what it does. `dek help <command>` prints it. */
export const COMMAND_DOCS: Record<CommandName, CommandDoc> = {
  serve: {
    usage: ["dek [deck] [--visual] [--port N] [--remote]"],
    summary:
      "Start the dev server: skeleton slides, live reload, lint on save, and the presenter view.\nIt keeps running until Ctrl-C.",
  },
  help: {
    usage: ["dek help [command] [--agent]"],
    summary: "Show every command, or one command's usage and flags.",
  },
  init: {
    usage: ["dek init [dir] [--deck NAME]"],
    summary:
      "Create a project in dir (default: here), optionally with a first deck.\nNothing that exists is overwritten. Inside a project, add a deck with dek new.",
  },
  new: {
    usage: ["dek new <name> [--theme-from DECK]"],
    summary: "Add a deck with the project's theme, or another deck's, and its skeleton slides.",
  },
  ls: {
    usage: ["dek ls [deck]"],
    summary: "List the decks, or summarize one: sections, slides, diagnostics, and timing.",
  },
  ref: {
    usage: ["dek ref owner/repo/deck[@rev]", "dek ref", "dek ref rm <ref>"],
    summary:
      "Pin another project's deck to read as a model, list the pins, or drop one.\nls, show, theme, and shot read a ref as they read a deck.",
  },
  show: {
    usage: ["dek show [deck] <slug>"],
    summary: "Print what one slide is made of: its script, HTML, CSS, TS, theme rules, and assets.",
  },
  theme: {
    usage: ["dek theme [deck] [layout]"],
    summary: "List the theme's layouts, classes, and tokens, or print one layout's markup.",
  },
  sync: {
    usage: ["dek sync [deck]"],
    summary:
      "Create a skeleton for each section without slide HTML, refresh the skeletons\nnobody has edited since, and remove the ones whose section is gone.",
  },
  lint: {
    usage: ["dek lint [deck] [--fix] [--visual] [--format sarif]"],
    summary: "Check the script against the slides. Errors exit 1; warnings alone do not.",
  },
  mv: {
    usage: ["dek mv <old> <new>", "dek mv <slug> --before|--after <slug>"],
    summary: "Rename a section and every file named after it, or move it in the script.",
  },
  build: {
    usage: ["dek build [deck] [--root-dist] [--url <url>]"],
    summary:
      "Write the whole talk into one HTML file, dist/<deck>.html. Lint never stops a build;\nthe output says what lint found. Given the URL dist/ is served from, the first slide\nalso becomes dist/<deck>.png, the picture a shared link shows.",
  },
  check: {
    usage: ["dek check [deck] <slug> [--shot] [--voice]"],
    summary: "Lint one slide, rendered rules included when Playwright is installed.",
  },
  goto: {
    usage: ["dek goto [deck] <slug>"],
    summary: "Move the open browser to a slide. Needs a running dev server.",
  },
  current: {
    usage: ["dek current [deck]"],
    summary: "Print the slide on screen. Needs a running dev server.",
  },
  shot: {
    usage: ["dek shot [deck] [slug] [--step ID|N]", "dek shot <a> --to <b> [--at 0..1]"],
    summary: "Screenshot slides at their last beat, or one frame of the transition from a to b.",
  },
  pdf: {
    usage: ["dek pdf [deck] [--root-dist]"],
    summary: "Write dist/<deck>.pdf, one page per slide at its last beat. Needs Playwright.",
  },
  cues: {
    usage: ["dek cues [deck]"],
    summary: "Print the spoken paragraphs as Cue[]. No voice engine needed.",
  },
  voice: {
    usage: [
      "dek voice [deck]",
      "dek voice speakers",
      "dek voice say TEXT",
      "dek voice dict add WORD KANA [--accent N]",
      "dek voice pin",
    ],
    summary:
      "Synthesize the sentences that changed, list speakers, speak one sentence, add a reading,\nor pin the audio and timeline.",
  },
  video: {
    usage: ["dek video [deck] [slug] [--fps N] [--root-dist]"],
    summary: "Bake dist/<deck>.mp4 from the Timeline, or one slide into .cache/video/.",
  },
  rehearse: {
    usage: ["dek rehearse [slug] [--remote]"],
    summary: "Play the deck to its Timeline, advancing on its own. Keeps running until Ctrl-C.",
  },
};

const DOCS_URL = "https://hajimism.github.io/dek/reference/cli.html";

/** `dek help <command>`: its usage, what it does, and every flag it takes. */
export function commandHelp(command: CommandName): string {
  const doc = COMMAND_DOCS[command];
  const flags: FlagName[] = [...COMMAND_FLAGS[command], "json", "help"];
  const label = (flag: FlagName): string => {
    const { value } = FLAG_DOCS[flag];
    if (flag === "help") {
      return "--help, -h";
    }
    return value ? `--${flag} ${value}` : `--${flag}`;
  };
  const width = Math.max(...flags.map((flag) => label(flag).length)) + 3;
  const [first, ...more] = doc.usage;
  return [
    `usage: ${first}`,
    ...more.map((line) => `       ${line}`),
    "",
    doc.summary,
    "",
    "flags",
    ...flags.map((flag) => `  ${label(flag).padEnd(width)}${FLAG_DOCS[flag].text}`),
    "",
    DOCS_URL,
  ].join("\n");
}

export type HelpRequest =
  | { kind: "version" }
  | { kind: "help"; topic?: CommandName; agent: boolean };

/**
 * Whether argv asks for help or the version instead of running a command.
 * `dek help <word>` names a command, so a word that is none fails as `dek <word>` would.
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
    return isCommand(word) ? { kind: "help", topic: word, agent } : { kind: "help", agent };
  }
  if (word === undefined || word === "help") {
    return { kind: "help", agent };
  }
  // `serve` is no word to type, yet it is the topic for the bare `dek [deck]`.
  if (isCommand(word) || word === "serve") {
    return { kind: "help", topic: word, agent };
  }
  throw unknownCommandError(word, []);
}

export function versionText(): string {
  return `dek ${pkg.version}`;
}

function isCommand(word: string | undefined): word is CommandName {
  return word !== undefined && word !== "serve" && Object.hasOwn(COMMAND_DOCS, word);
}

/** A word the user typed that is neither a command nor a deck, with the likeliest fix. */
export function unknownCommandError(word: string, decks: string[]): DekError {
  const commands = Object.keys(COMMAND_DOCS).filter((name) => name !== "serve");
  const guess = suggest(word, [...commands, ...decks]);
  return new DekError(`unknown command: ${word}`, {
    hint: guess ? `did you mean \`dek ${guess}\`?` : "run `dek help` to see the commands",
  });
}
