import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../core/config.ts";
import { DekError } from "../core/index.ts";
import { isDeckName } from "../core/path.ts";
import { createDeck } from "./files.ts";
import { requireDeckFromCwd, requireProject } from "./scope.ts";

export type NewResult = {
  name: string;
  dir: string;
  created: string[];
};

export function newCommand(options: { cwd: string; name?: string; themeFrom?: string }): NewResult {
  const name = options.name?.trim();
  if (!name) {
    throw new DekError("usage: dek new <name>", { hint: "usage: dek new <name>" });
  }
  if (!isDeckName(name)) {
    throw new DekError(`invalid deck name "${name}"`, {
      hint: "use a name without path separators",
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

  const created = createDeck(project.root, name, themeSource, loadConfig(project.configPath).voice);
  return { name, dir, created };
}
