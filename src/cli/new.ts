import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../core/config.ts";
import { deckPaths } from "../core/deck-paths.ts";
import { DekError } from "../core/error.ts";
import { type HiddenText, hiddenText } from "../core/foreign-text.ts";
import { DECK_NAME_HINT, isDeckName } from "../core/path.ts";
import { isRefName } from "../core/ref-name.ts";
import { readDeckFile } from "../core/resolve.ts";
import { readSourceIfExists } from "../core/safe-fs.ts";
import { syncDeck } from "../core/sync.ts";
import { applyPlan, deckPlan, nextSteps } from "./files.ts";
import {
  hiddenField,
  type RefInfo,
  requireDeckFromCwd,
  requireProject,
  resolveTarget,
} from "./scope.ts";

export type NewResult = {
  name: string;
  dir: string;
  created: string[];
  /** dek's own files at the project root that were there and are now brought up to date. */
  updated: string[];
  /** The commands to run next, from the directory new ran in. */
  next: string[];
  /** Set when the theme came from a ref with no license. */
  warnings: string[];
  /**
   * A ref's theme's lines, now the new deck's theme.css, that hold characters a person cannot
   * see: the copy is the deck's own, so they are its author's to remove.
   */
  hidden?: HiddenText[];
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

  // A ref is read where it is, never written: only the copy below is the new deck's.
  const fromRef =
    options.themeFrom !== undefined && isRefName(options.themeFrom)
      ? resolveTarget(options.cwd, "deck", { refs: true, deck: options.themeFrom })
      : undefined;
  const ref = fromRef?.ref;
  const fromDeck = fromRef
    ? fromRef.deck
    : options.themeFrom
      ? requireDeckFromCwd(options.cwd, options.themeFrom).deck
      : undefined;
  const themeSource = fromDeck ? deckPaths(fromDeck.dir).theme : join(project.root, "theme.css");
  // What is copied is published with the new deck: a link out of its project is refused.
  const source = fromDeck
    ? readDeckFile(fromDeck.dir, themeSource)
    : readSourceIfExists(themeSource, project.root);
  if (source === undefined) {
    throw new DekError("theme.css not found", {
      path: themeSource,
      hint: ref
        ? "run `dekc ref` to list the refs, and pick one whose deck has theme.css"
        : options.themeFrom
          ? "run `dekc ls` and pick a deck that has theme.css"
          : "add theme.css at the project root",
    });
  }

  const theme = `${ref ? provenance(ref) : ""}${source}`;
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
    warnings:
      ref && ref.license === null
        ? [
            `${ref.name} has no license; ask its author before you present or share a deck built on its theme`,
          ]
        : [],
    ...hiddenField(ref, ref ? hiddenText(theme, deckPaths(dir).theme) : []),
  };
}

/** The first line of a theme copied from a ref: where it came from, for its reader and its credit. */
function provenance(ref: RefInfo): string {
  return `/* Theme from the ref ${ref.name} at ${ref.rev.slice(0, 7)}. */\n`;
}
