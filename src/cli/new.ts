import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../core/config.ts";
import { deckPaths } from "../core/deck-paths.ts";
import { DekcError } from "../core/error.ts";
import { DECK_NAME_HINT, isDeckName } from "../core/path.ts";
import { syncDeck } from "../core/sync.ts";
import { applyPlan, deckPlan, nextSteps } from "./files.ts";
import { requireDeckFromCwd, requireProject } from "./scope.ts";

export type NewResult = {
  name: string;
  dir: string;
  created: string[];
  /** dekc's own files at the project root that were there and are now brought up to date. */
  updated: string[];
  /** The commands to run next, from the directory new ran in. */
  next: string[];
};

export function newCommand(options: { cwd: string; name: string; themeFrom?: string }): NewResult {
  const { name } = options;
  if (!isDeckName(name)) {
    throw new DekcError(`invalid deck name "${name}"`, {
      hint: DECK_NAME_HINT,
    });
  }

  const project = requireProject(options.cwd);
  const dir = join(project.root, "decks", name);
  if (existsSync(dir)) {
    throw new DekcError(`deck "${name}" already exists`, {
      path: dir,
      hint: "run `dekc ls`",
    });
  }

  const themeSource = options.themeFrom
    ? deckPaths(requireDeckFromCwd(options.cwd, options.themeFrom).deck.dir).theme
    : join(project.root, "theme.css");
  if (!existsSync(themeSource)) {
    throw new DekcError("theme.css not found", {
      path: themeSource,
      hint: options.themeFrom
        ? "run `dekc ls` and pick a deck that has theme.css"
        : "add theme.css at the project root",
    });
  }

  const theme = readFileSync(themeSource, "utf8");
  const voice = loadConfig(project.configPath).voice;
  const { created } = applyPlan(deckPlan(project.root, name, theme, voice));
  // As sync would. AGENTS.md and .dekc/ follow the project theme and dekc, so they change here
  // only when either moved on since the last command that wrote them: say which.
  const synced = syncDeck(dir);
  created.push(...synced.created, ...synced.dekcFiles.created);
  return {
    name,
    dir,
    created,
    updated: synced.dekcFiles.updated,
    next: nextSteps(options.cwd, project.root, dir),
  };
}
