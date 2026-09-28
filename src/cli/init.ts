import { existsSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseCss, publishedTokens } from "../core/css.ts";
import { deckPaths } from "../core/deck-paths.ts";
import { DekError } from "../core/error.ts";
import { REQUIRED_TOKENS } from "../core/lint/tokens.ts";
import { walkUp } from "../core/optional.ts";
import { DECK_NAME_HINT, isDeckName } from "../core/path.ts";
import { readTextIfExists } from "../core/resolve.ts";
import {
  defaultTsconfig,
  dekFilePaths,
  type FileChanges,
  syncDeck,
  writeDekFiles,
} from "../core/sync.ts";
import {
  applyPlan,
  checkFileSlots,
  deckPlan,
  defaultGitignore,
  defaultRumdl,
  defaultTheme,
  defaultToml,
  nextSteps,
  type PlannedPath,
  playwrightStep,
  shellQuote,
} from "./files.ts";

export type InitResult = {
  root: string;
  /** Paths init wrote. */
  created: string[];
  /** dek's own files, already there, that init brought up to date. */
  updated: string[];
  /** Files that were already there and differ from what init would write; left as they are. */
  kept: string[];
  /** The commands to run next, from the directory init ran in. */
  next: string[];
  /** The Playwright install, when the project lacks it: `dek shot`, `dek pdf`, and `--visual` need it. */
  playwright?: string;
  /**
   * The tokens a kept theme.css lacks of the ones every deck needs, when it lacks any. Each deck
   * copies the project theme, so its lint would report them all on its first run.
   */
  missingTokens?: string[];
};

/**
 * Plans the whole project, checks it, then writes only what is missing. Run
 * again, it fills in what is gone and keeps everything else, edits included.
 */
export function initCommand(options: { cwd: string; dir?: string; deck?: string }): InitResult {
  const root = resolve(options.cwd, options.dir ?? ".");
  if (options.deck !== undefined && !isDeckName(options.deck)) {
    throw new DekError(`invalid deck name "${options.deck}"`, {
      hint: DECK_NAME_HINT,
    });
  }
  checkTarget(root);
  checkFileSlots(dekFilePaths(root));

  const { created, kept } = applyPlan(projectPlan(root, options.deck));
  const deckDir = options.deck ? join(root, "decks", options.deck) : undefined;
  // A starter script init just wrote gets its skeletons as sync writes them; a script that was
  // already there is the author's, and so is whether it parses.
  const started = deckDir !== undefined && created.includes(deckPaths(deckDir).script);
  const dekFiles = started ? syncDeckFiles(deckDir, created) : writeDekFiles(root);
  created.push(...dekFiles.created);
  const playwright = playwrightStep(root);
  const missingTokens = kept.includes(join(root, "theme.css")) ? missingThemeTokens(root) : [];
  return {
    root,
    created,
    updated: dekFiles.updated,
    kept,
    next: nextSteps(options.cwd, root, deckDir),
    ...(playwright ? { playwright } : {}),
    ...(missingTokens.length > 0 ? { missingTokens } : {}),
  };
}

/** The tokens every deck needs that the project's theme.css does not publish on `.slide`. */
function missingThemeTokens(root: string): string[] {
  const published = new Set(
    publishedTokens(parseCss(readTextIfExists(join(root, "theme.css")) ?? "")).map(
      (token) => token.name,
    ),
  );
  return REQUIRED_TOKENS.filter((name) => !published.has(name));
}

function syncDeckFiles(deckDir: string, created: string[]): FileChanges {
  const synced = syncDeck(deckDir);
  created.push(...synced.created);
  return synced.dekFiles;
}

/** Everything init writes but `.dek/` and AGENTS.md, in the order a reader meets it. */
function projectPlan(root: string, deck: string | undefined): PlannedPath[] {
  const themePath = join(root, "theme.css");
  // A first deck is drawn in the theme that will be there: the one kept, or dek's.
  const theme = readTextIfExists(themePath) ?? defaultTheme();
  return [
    { path: join(root, "dek.toml"), contents: defaultToml() },
    { path: themePath, contents: defaultTheme() },
    { path: join(root, ".rumdl.toml"), contents: defaultRumdl() },
    { path: join(root, ".gitignore"), contents: defaultGitignore() },
    { path: join(root, "tsconfig.json"), contents: defaultTsconfig() },
    { path: join(root, "assets") },
    { path: join(root, "decks") },
    ...(deck ? deckPlan(root, deck, theme) : []),
  ];
}

/**
 * The target is a directory, or nothing yet, and no project already holds it:
 * a project inside another would be a second root the outer one cannot see,
 * and its decks belong under the outer project's decks/ instead.
 */
function checkTarget(root: string): void {
  if (existsSync(root) && !statSync(root).isDirectory()) {
    throw new DekError("not a directory", { path: root, hint: "pass a directory to init" });
  }
  const outer = walkUp(root, (dir) => {
    const config = join(dir, "dek.toml");
    return existsSync(config) && statSync(config).isFile() ? dir : undefined;
  });
  if (outer !== undefined && outer !== root) {
    throw new DekError(`already inside the dek project at ${outer}`, {
      path: join(outer, "dek.toml"),
      hint: `add a deck to that project with \`dek new ${shellQuote(basename(root))}\`, or run init outside it`,
    });
  }
}
