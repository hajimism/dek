import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { DekError } from "./error.ts";
import { walkUp } from "./optional.ts";
import { parseScript } from "./parse.ts";
import type { Deck, Section } from "./schema.ts";

export type ProjectDeck = {
  name: string;
  dir: string;
  scriptPath: string;
  deck: Deck;
};

export type Project = {
  root: string;
  configPath: string;
  decks: ProjectDeck[];
  failed: Array<{ name: string; dir: string; scriptPath: string; error: DekError }>;
};

export type ResolvedDeck = {
  project: Project;
  deck: ProjectDeck;
};

export function resolveProject(startDir: string): Project {
  const { root, configPath } = findRoot(resolve(startDir));
  const { decks, failed } = loadDecks(root);
  return { root, configPath, decks, failed };
}

export function locateDeck(root: string, dir: string): { name: string; dir: string } | undefined {
  const name = deckNameFromDir(root, dir);
  if (!name) {
    return undefined;
  }
  return { name, dir: join(root, "decks", name) };
}

export function resolveDeck(dir: string): ResolvedDeck {
  const { root, configPath } = findRoot(resolve(dir));
  const located = locateDeck(root, dir);
  if (!located) {
    throw new DekError("not a deck directory", {
      path: dir,
      hint: "pass a deck name or run from a deck directory",
    });
  }
  const loaded = readDeck(root, located.name);
  if (!loaded.ok) {
    throw loaded.error.error;
  }
  return {
    project: { root, configPath, decks: [loaded.deck], failed: [] },
    deck: loaded.deck,
  };
}

export function asResolvedDeck(input: string | ResolvedDeck): ResolvedDeck {
  return typeof input === "string" ? resolveDeck(input) : input;
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

export function listSlides(deckDir: string): { slug: string; path: string }[] {
  return listSlideFiles(deckDir, ".html");
}

/** Files a slide may keep next to its HTML, moved and linted with it. */
export const SLIDE_SIDECARS = [".css", ".ts"] as const;

export type SlideSidecar = (typeof SLIDE_SIDECARS)[number];

export function listSlideFiles(
  deckDir: string,
  ext: ".html" | ".js" | SlideSidecar,
): { slug: string; path: string }[] {
  const dir = join(deckDir, "slides");
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return [];
  }
  return (
    readdirSync(dir)
      // A declaration file carries types for the editor, not a slide.
      .filter((name) => name.endsWith(ext) && !name.endsWith(".d.ts"))
      .sort((a, b) => a.localeCompare(b))
      .flatMap((name) => {
        const path = join(dir, name);
        if (!statSync(path).isFile()) {
          return [];
        }
        return [{ slug: name.slice(0, -ext.length), path }];
      })
  );
}

function findRoot(startDir: string): { root: string; configPath: string } {
  const hit = walkUp(startDir, (dir) => {
    const configPath = join(dir, "dek.toml");
    if (existsSync(configPath) && statSync(configPath).isFile()) {
      return { root: dir, configPath };
    }
  });
  if (!hit) {
    throw new DekError("dek.toml not found", { path: startDir });
  }
  return hit;
}

function loadDecks(root: string): {
  decks: ProjectDeck[];
  failed: Project["failed"];
} {
  const decksDir = join(root, "decks");
  if (!existsSync(decksDir)) {
    return { decks: [], failed: [] };
  }
  if (!statSync(decksDir).isDirectory()) {
    throw new DekError("decks is not a directory", { path: decksDir });
  }

  const decks: ProjectDeck[] = [];
  const failed: Project["failed"] = [];

  for (const entry of readdirSync(decksDir, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const loaded = readDeck(root, entry.name);
    if (loaded.ok) {
      decks.push(loaded.deck);
    } else {
      failed.push(loaded.error);
    }
  }

  return { decks, failed };
}

function deckNameFromDir(root: string, dir: string): string | undefined {
  const rel = relative(join(root, "decks"), resolve(dir));
  if (!rel || rel === "." || rel === ".." || rel.startsWith(`..${sep}`)) {
    return undefined;
  }
  const name = rel.split(sep)[0];
  return name || undefined;
}

function readDeck(
  root: string,
  name: string,
): { ok: true; deck: ProjectDeck } | { ok: false; error: Project["failed"][number] } {
  const dir = join(root, "decks", name);
  const scriptPath = join(dir, "script.md");
  if (!existsSync(scriptPath) || !statSync(scriptPath).isFile()) {
    return {
      ok: false,
      error: {
        name,
        dir,
        scriptPath,
        error: new DekError(`deck "${name}" has no script.md`, { path: scriptPath }),
      },
    };
  }
  try {
    return {
      ok: true,
      deck: {
        name,
        dir,
        scriptPath,
        deck: parseScript(readFileSync(scriptPath, "utf8"), scriptPath),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        name,
        dir,
        scriptPath,
        error:
          error instanceof DekError ? error : new DekError(String(error), { path: scriptPath }),
      },
    };
  }
}
