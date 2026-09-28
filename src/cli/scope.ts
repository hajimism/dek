import { existsSync } from "node:fs";
import { join } from "node:path";
import { DekError } from "../core/error.ts";
import {
  isRefName,
  parseRefSource,
  REF_MARKER,
  readRefMeta,
  refLicense,
  refState,
} from "../core/ref.ts";
import {
  locateDeck,
  type Project,
  type ProjectDeck,
  requireSection,
  resolveProject,
} from "../core/resolve.ts";
import { suggest } from "../core/suggest.ts";

export { requireSection };

export type Scope = {
  project: Project;
  deck?: ProjectDeck;
};

/** A deck whose script.md cannot be read, and why. */
type UnreadableDeck = Project["failed"][number];

/**
 * What a command works on, which the CLI resolves before it runs: one deck, or every deck in
 * scope (the project's, or the one named).
 */
export type DeckScope = "deck" | "decks";

/** One deck of a project. */
export type DeckTarget = { project: Project; deck: ProjectDeck };

/** The decks in scope; `deck` is set when one was named or the command runs inside it. */
export type DecksTarget = {
  project: Project;
  decks: ProjectDeck[];
  deck?: ProjectDeck;
  /**
   * The decks in scope whose script.md cannot be read. Only a command that declares `unreadable`
   * is handed one it named; any other is refused with its error, as before.
   */
  failed?: UnreadableDeck[];
  /** Set when the deck is a ref. */
  ref?: RefInfo;
};

export function requireProject(cwd: string): Project {
  const project = resolveProject(cwd);
  if (existsSync(join(project.root, REF_MARKER))) {
    const name = readRefMeta(project.root)?.name ?? "<ref>";
    throw new DekError("this directory is inside a ref; refs are read-only", {
      path: project.root,
      hint: `run dek from your own project instead: \`dek show ${name} <slug>\``,
    });
  }
  return project;
}

export function inferDeckName(project: Project, cwd: string): string | undefined {
  const located = locateDeck(project.root, cwd);
  if (!located) {
    return undefined;
  }
  if (!isKnownDeckName(project, located.name)) {
    return undefined;
  }
  return located.name;
}

function isKnownDeckName(project: Project, name: string): boolean {
  return (
    project.decks.some((deck) => deck.name === name) ||
    project.failed.some((entry) => entry.name === name)
  );
}

/**
 * The deck a command's words name first, and the words left for the command. `max` is how many
 * words the command takes without a deck. A ref name is always a deck. More words than the
 * command takes make the first one a deck, found or not, so a typo in it is reported as a deck
 * not found. Otherwise the first word is a deck when it names one of the project's and dek does
 * not run inside a deck, where it names something in that deck instead. A command with
 * subcommands takes a word that is no deck as a mistyped subcommand, never as a deck.
 */
export function peelDeckArg(
  cwd: string,
  words: string[],
  grammar: { max: number; subcommands?: boolean },
): { deck?: string; rest: string[] } {
  const [first, ...rest] = words;
  if (first === undefined) {
    return { rest: words };
  }
  if (isRefName(first)) {
    return { deck: first, rest };
  }
  const extra = words.length > grammar.max;
  if (extra && grammar.subcommands !== true) {
    return { deck: first, rest };
  }
  let project: Project;
  try {
    project = requireProject(cwd);
  } catch {
    return { rest: words };
  }
  if (!isKnownDeckName(project, first)) {
    return { rest: words };
  }
  return extra || inferDeckName(project, cwd) === undefined
    ? { deck: first, rest }
    : { rest: words };
}

/** Whether a word names a deck of the project dek runs in, or a ref. */
export function namesDeck(cwd: string, word: string): boolean {
  if (isRefName(word)) {
    return true;
  }
  try {
    return isKnownDeckName(requireProject(cwd), word);
  } catch {
    return false;
  }
}

export function resolveScope(cwd: string, options: { deck?: string } = {}): Scope {
  const project = requireProject(cwd);
  const name = options.deck ?? inferDeckName(project, cwd);
  if (name === undefined) {
    return { project };
  }
  if (isRefName(name)) {
    throw new DekError(`"${name}" is a ref; refs are read-only`, {
      hint: `read it with \`dek show ${name} <slug>\`, then copy what you need into your own deck and rewrite it in your theme`,
    });
  }
  const deck = project.decks.find((entry) => entry.name === name);
  if (!deck) {
    const failed = project.failed.find((entry) => entry.name === name);
    if (failed) {
      throw failed.error;
    }
    const guess = suggest(name, [
      ...project.decks.map((entry) => entry.name),
      ...project.failed.map((entry) => entry.name),
    ]);
    throw new DekError(`deck "${name}" not found`, {
      path: join(project.root, "decks", name),
      hint: guess ? `did you mean \`${guess}\`? run \`dek ls\` for every deck` : "run `dek ls`",
    });
  }
  return { project, deck };
}

export function resolveDecks(
  cwd: string,
  options: { deck?: string; unreadable?: boolean } = {},
): DecksTarget {
  if (options.unreadable) {
    const unreadable = unreadableInScope(cwd, options.deck);
    if (unreadable) {
      return { project: unreadable.project, decks: [], failed: [unreadable.failed] };
    }
  }
  const scope = resolveScope(cwd, options);
  if (scope.deck) {
    return { project: scope.project, decks: [scope.deck], deck: scope.deck };
  }
  const { failed } = scope.project;
  return {
    project: scope.project,
    decks: scope.project.decks,
    ...(failed.length > 0 && { failed }),
  };
}

/** The one deck in scope, named or around `cwd`, when its script.md cannot be read. */
function unreadableInScope(
  cwd: string,
  deck: string | undefined,
): { project: Project; failed: UnreadableDeck } | undefined {
  const project = requireProject(cwd);
  const name = deck ?? inferDeckName(project, cwd);
  const failed = project.failed.find((entry) => entry.name === name);
  return failed ? { project, failed } : undefined;
}

function requireDeck(scope: Scope, cwd: string): ProjectDeck {
  if (scope.deck) {
    return scope.deck;
  }
  throw new DekError("not inside a deck directory; pass a deck name", {
    path: cwd,
    hint: "pass a deck name or --deck <name>",
  });
}

export function requireDeckFromCwd(cwd: string, deck?: string): DeckTarget {
  const scope = resolveScope(cwd, { deck });
  return { project: scope.project, deck: requireDeck(scope, cwd) };
}

/** Where a ref came from, returned by the commands that read one. */
export type RefInfo = {
  name: string;
  rev: string;
  /** The snapshot directory. */
  dir: string;
  /** The snapshot's license file, or null when the source had none. */
  license: string | null;
};

/** One deck to read: the project's own, or a ref. */
export type ReadableDeck = DeckTarget & { ref?: RefInfo };

/**
 * What a command declares it works on, resolved: one deck or the decks in scope. Only a command
 * whose spec says `refs` reads a ref; it never writes, so a ref cannot reach a command that
 * would change it. For every other command resolveScope refuses a ref.
 */
export function resolveTarget(cwd: string, scope: "deck", options?: TargetOptions): ReadableDeck;
export function resolveTarget(cwd: string, scope: "decks", options?: TargetOptions): DecksTarget;
export function resolveTarget(
  cwd: string,
  scope: DeckScope,
  options?: TargetOptions,
): ReadableDeck | DecksTarget;
export function resolveTarget(
  cwd: string,
  scope: DeckScope,
  options: TargetOptions = {},
): ReadableDeck | DecksTarget {
  const ref =
    options.refs === true && options.deck !== undefined && isRefName(options.deck)
      ? resolveRef(cwd, options.deck)
      : undefined;
  if (scope === "deck") {
    return ref ?? requireDeckFromCwd(cwd, options.deck);
  }
  return ref
    ? { project: ref.project, decks: [ref.deck], deck: ref.deck, ref: ref.ref }
    : resolveDecks(cwd, { deck: options.deck, unreadable: options.unreadable === true });
}

/** How a command's spec asks for its decks; see `refs` and `unreadable` there. */
type TargetOptions = { deck?: string; refs?: boolean; unreadable?: boolean };

function resolveRef(cwd: string, arg: string): ReadableDeck & { ref: RefInfo } {
  const source = parseRefSource(arg);
  const project = requireProject(cwd);
  const { pinned, dir, fetched } = refState(project, source.name);
  if (pinned === undefined) {
    throw new DekError(`ref "${source.name}" is not added`, {
      path: project.configPath,
      hint: `run \`dek ref ${arg}\``,
    });
  }
  if (source.rev !== undefined && source.rev !== pinned) {
    throw new DekError(`"${arg}" is not the pinned version, ${pinned.slice(0, 7)}`, {
      path: project.configPath,
      hint: `run \`dek ref ${arg}\` to pin that version, or drop @${source.rev}`,
    });
  }
  if (!fetched) {
    throw new DekError(`ref "${source.name}" is not fetched`, {
      path: dir,
      hint: `run \`dek ref ${source.name}@${pinned}\``,
    });
  }
  const snapshot = resolveProject(dir);
  const found = snapshot.decks.find((entry) => entry.name === source.deck);
  if (!found) {
    const failed = snapshot.failed.find((entry) => entry.name === source.deck);
    if (failed) {
      throw failed.error;
    }
    throw new DekError(`ref "${source.name}" has no deck "${source.deck}"`, {
      path: dir,
      hint: `run \`dek ref ${source.name}@${pinned}\` to fetch it again`,
    });
  }
  return {
    project: snapshot,
    deck: found,
    ref: { name: source.name, rev: pinned, dir, license: refLicense(dir) },
  };
}
