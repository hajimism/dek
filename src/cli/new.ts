import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../core/config.ts";
import { deckPaths } from "../core/deck-paths.ts";
import { DekError } from "../core/error.ts";
import { DECK_NAME_HINT, isDeckName } from "../core/path.ts";
import { syncDeck } from "../core/sync.ts";
import { applyPlan, deckPlan, nextSteps } from "./files.ts";
import { requireDeckFromCwd, requireProject } from "./scope.ts";

export type NewResult = {
  name: string;
  dir: string;
  created: string[];
  /** dek's own files at the project root that were there and are now brought up to date. */
  updated: string[];
  /** The commands to run next, from the directory new ran in. */
  next: string[];
};

export function newCommand(options: { cwd: string; name: string; themeFrom?: string }): NewResult {
  const { name } = options;
  if (!isDeckName(name)) {
    throw new DekError(`invalid deck name "${name}"`, {
      hint: DECK_NAME_HINT,
    });
  }

  const project = requireProject(options.cwd);
  const dir = join(project.root, "decks", name);
  if (existsSync(dir)) {
    throw new DekError(`deck "${name}" already exists`, {
      path: dir,
      hint: "run `dekc ls`",
    });
  }

  const themeSource = options.themeFrom
    ? deckPaths(requireDeckFromCwd(options.cwd, options.themeFrom).deck.dir).theme
    : join(project.root, "theme.css");
  if (!existsSync(themeSource)) {
    throw new DekError("theme.css not found", {
      path: themeSource,
      hint: options.themeFrom
        ? "run `dekc ls` and pick a deck that has theme.css"
        : "add theme.css at the project root",
    });
  }

  const theme = readFileSync(themeSource, "utf8");
  const { created } = applyPlan(
    deckPlan(project.root, name, theme, loadConfig(project.configPath)),
  );
  // As sync would. AGENTS.md and .dek/ follow the project theme and dek, so they change here
  // only when either moved on since the last command that wrote them: say which.
  const synced = syncDeck(dir);
  created.push(...synced.created, ...synced.dekFiles.created);
  return {
    name,
    dir,
    created,
    updated: synced.dekFiles.updated,
    next: nextSteps(options.cwd, project.root, dir),
  };
}
