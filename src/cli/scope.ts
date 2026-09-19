import { join } from "node:path";
import { DekError, type Project, type ProjectDeck, resolveProject } from "../core/index.ts";
import { locateDeck, requireSection } from "../core/resolve.ts";

export { requireSection };

export type Scope = {
  project: Project;
  deck?: ProjectDeck;
};

export const VOICE_SUBCOMMANDS = new Set(["speakers", "say", "dict", "pin"]);

const DECK_ONLY_COMMANDS = new Set(["ls", "lint", "sync", "build", "pdf", "cues", "current"]);

const SLUG_COMMANDS = new Set(["show", "check", "goto", "shot", "video", "rehearse"]);

export function requireProject(cwd: string): Project {
  try {
    return resolveProject(cwd);
  } catch (error) {
    if (error instanceof DekError && error.message.includes("dek.toml not found")) {
      throw new DekError("not a dek project", {
        path: cwd,
        hint: "run `dek init` first",
        cause: error,
      });
    }
    throw error;
  }
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

export function isKnownDeckName(project: Project, name: string): boolean {
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
  if (options.command === "init" || options.command === "new") {
    return { rest: options.args };
  }

  const first = options.args[0];
  if (!first) {
    return { rest: options.args };
  }
  if (options.command === "voice" && VOICE_SUBCOMMANDS.has(first)) {
    return { rest: options.args };
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
