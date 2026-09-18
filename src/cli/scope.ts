import { join } from "node:path";
import { DekError, type Project, type ProjectDeck, resolveProject } from "../core/index.ts";
import { locateDeck } from "../core/resolve.ts";
import type { Section } from "../core/schema.ts";

export type Scope = {
  project: Project;
  deck?: ProjectDeck;
};

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
  const known =
    project.decks.some((deck) => deck.name === located.name) ||
    project.failed.some((entry) => entry.name === located.name);
  if (!known) {
    return undefined;
  }
  return located.name;
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
  throw new DekError("not inside a deck directory; use --deck <name>", {
    path: cwd,
    hint: "use --deck <name>",
  });
}

export function requireDeckFromCwd(
  cwd: string,
  deck?: string,
): { project: Project; deck: ProjectDeck } {
  const scope = resolveScope(cwd, { deck });
  return { project: scope.project, deck: requireDeck(scope, cwd) };
}

export function requireSection(deck: ProjectDeck, slug: string): Section {
  const section = deck.deck.sections.find((entry) => entry.slug === slug);
  if (!section) {
    throw new DekError(`section "${slug}" not found`, {
      path: deck.scriptPath,
      hint: "run `dek ls`",
    });
  }
  return section;
}
