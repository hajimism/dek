import { existsSync } from "node:fs";
import { join } from "node:path";
import { DekError, type Project, type ProjectDeck, resolveProject } from "../core/index.ts";
import {
  isRefName,
  parseRefSource,
  REF_MARKER,
  readRefMeta,
  refLicense,
  refState,
} from "../core/ref.ts";
import { locateDeck, requireSection } from "../core/resolve.ts";

export { requireSection };

export type Scope = {
  project: Project;
  deck?: ProjectDeck;
};

const VOICE_SUBCOMMANDS = new Set(["speakers", "say", "dict", "pin"]);

const DECK_ONLY_COMMANDS = new Set(["ls", "lint", "sync", "build", "pdf", "cues", "current"]);

/** Commands whose one positional names something inside the deck, so it is not a deck name from inside one. */
const SLUG_COMMANDS = new Set(["show", "check", "goto", "shot", "video", "rehearse", "theme"]);

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

export function peelDeckArg(
  cwd: string,
  options: {
    command?: string;
    deck?: string;
    args: string[];
    before?: string;
    after?: string;
  },
): { deck?: string; rest: string[] } {
  if (options.deck) {
    return { deck: options.deck, rest: options.args };
  }
  if (options.command === "init" || options.command === "new" || options.command === "ref") {
    return { rest: options.args };
  }

  const first = options.args[0];
  if (!first) {
    return { rest: options.args };
  }
  if (options.command === "voice" && VOICE_SUBCOMMANDS.has(first)) {
    return { rest: options.args };
  }
  if (isRefName(first)) {
    return { deck: first, rest: options.args.slice(1) };
  }

  const deckOnly = options.command !== undefined && DECK_ONLY_COMMANDS.has(options.command);
  if (deckOnly) {
    return { deck: first, rest: options.args.slice(1) };
  }

  let project: Project;
  try {
    project = requireProject(cwd);
  } catch {
    return { rest: options.args };
  }

  if (!isKnownDeckName(project, first)) {
    return { rest: options.args };
  }

  if (options.command === "mv") {
    const reorder = options.before !== undefined || options.after !== undefined;
    const canPeel = options.args.length >= 3 || (reorder && options.args.length >= 2);
    if (!canPeel) {
      return { rest: options.args };
    }
  }

  const inferred = inferDeckName(project, cwd);
  if (
    inferred &&
    options.args.length === 1 &&
    options.command !== undefined &&
    SLUG_COMMANDS.has(options.command)
  ) {
    return { rest: options.args };
  }

  return { deck: first, rest: options.args.slice(1) };
}

export function resolveScope(
  cwd: string,
  options: { deck?: string; positionalDeck?: string } = {},
): Scope {
  const project = requireProject(cwd);
  const name = options.deck ?? options.positionalDeck ?? inferDeckName(project, cwd);
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
    throw new DekError(`deck "${name}" not found`, {
      path: join(project.root, "decks", name),
      hint: "run `dek ls`",
    });
  }
  return { project, deck };
}

export function resolveDecks(
  cwd: string,
  options: { deck?: string; positionalDeck?: string } = {},
): { project: Project; decks: ProjectDeck[]; deck?: ProjectDeck } {
  const scope = resolveScope(cwd, options);
  if (scope.deck) {
    return { project: scope.project, decks: [scope.deck], deck: scope.deck };
  }
  return { project: scope.project, decks: scope.project.decks };
}

export function requireDeck(scope: Scope, cwd: string): ProjectDeck {
  if (scope.deck) {
    return scope.deck;
  }
  throw new DekError("not inside a deck directory; pass a deck name", {
    path: cwd,
    hint: "pass a deck name or --deck <name>",
  });
}

export function requireDeckFromCwd(
  cwd: string,
  deck?: string,
): { project: Project; deck: ProjectDeck } {
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

export type ReadableDeck = {
  project: Project;
  deck: ProjectDeck;
  ref?: RefInfo;
};

/**
 * The commands that read through `requireReadableDeck`, so a ref may be their
 * deck; the CLI fetches a pinned ref's missing snapshot before running one.
 */
export const REF_READERS: ReadonlySet<string> = new Set(["ls", "show", "theme", "shot"]);

/**
 * One deck to read: the project's own, or a ref. Only commands that never
 * write call this, so a ref cannot reach a command that would change it;
 * everything else goes through resolveScope, which refuses refs.
 */
export function requireReadableDeck(cwd: string, deck?: string): ReadableDeck {
  if (deck !== undefined && isRefName(deck)) {
    return resolveRef(cwd, deck);
  }
  return requireDeckFromCwd(cwd, deck);
}

function resolveRef(cwd: string, arg: string): ReadableDeck {
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
