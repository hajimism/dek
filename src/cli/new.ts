import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../core/config.ts";
import { DekError } from "../core/index.ts";
import { DECK_NAME_HINT, isDeckName } from "../core/path.ts";
import { syncDeck } from "../core/sync.ts";
import { applyPlan, deckPlan, nextSteps } from "./files.ts";
import { requireDeckFromCwd, requireProject } from "./scope.ts";

export type NewResult = {
  name: string;
  dir: string;
  created: string[];
  /** The commands to run next, from the directory new ran in. */
  next: string[];
};

export function newCommand(options: { cwd: string; name?: string; themeFrom?: string }): NewResult {
  const name = options.name?.trim();
  if (!name) {
    throw new DekError("usage: dek new <name>", { hint: "for example, `dek new 2026-10-talk`" });
  }
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
      hint: "run `dek ls`",
    });
  }

  const themeSource = options.themeFrom
    ? join(requireDeckFromCwd(options.cwd, options.themeFrom).deck.dir, "theme.css")
    : join(project.root, "theme.css");
  if (!existsSync(themeSource)) {
    throw new DekError("theme.css not found", {
      path: themeSource,
      hint: options.themeFrom
        ? "run `dek ls` and pick a deck that has theme.css"
        : "add theme.css at the project root",
    });
  }

  const theme = readFileSync(themeSource, "utf8");
  const voice = loadConfig(project.configPath).voice;
  const { created } = applyPlan(deckPlan(project.root, name, theme, voice));
  // As sync would: AGENTS.md and .dek/ follow the project, now one deck larger.
  created.push(...syncDeck(dir).created);
  return { name, dir, created, next: nextSteps(options.cwd, project.root, dir) };
}
