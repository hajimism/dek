import { existsSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { DekError, writeFrontmatterSchema } from "../core/index.ts";
import { walkUp } from "../core/optional.ts";
import { isDeckName } from "../core/path.ts";
import { readTextIfExists } from "../core/resolve.ts";
import { defaultTsconfig, writeAgentsMd, writeSlideTypes } from "../core/sync.ts";
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
  shellQuote,
} from "./files.ts";

export type InitResult = {
  root: string;
  /** Paths init wrote. */
  created: string[];
  /** Files that were already there and differ from what init would write; left as they are. */
  kept: string[];
  /** The commands to run next, from the directory init ran in. */
  next: string[];
};

/**
 * Plans the whole project, checks it, then writes only what is missing. Run
 * again, it fills in what is gone and keeps everything else, edits included.
 */
export function initCommand(options: { cwd: string; dir?: string; deck?: string }): InitResult {
  const root = resolve(options.cwd, options.dir ?? ".");
  if (options.deck !== undefined && !isDeckName(options.deck)) {
    throw new DekError(`invalid deck name "${options.deck}"`, {
      hint: "use a name without path separators",
    });
  }
  checkTarget(root);
  checkFileSlots(dekFiles(root));

  const { created, kept } = applyPlan(projectPlan(root, options.deck));
  created.push(...writeDekFiles(root));
  const deckDir = options.deck ? join(root, "decks", options.deck) : undefined;
  return { root, created, kept, next: nextSteps(options.cwd, root, deckDir) };
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

function dekFiles(root: string): string[] {
  return [
    join(root, "AGENTS.md"),
    join(root, ".dek", "schema.json"),
    join(root, ".dek", "slide.d.ts"),
  ];
}

/**
 * `.dek/` and dek's block in AGENTS.md are dek's own, refreshed on every run as sync would, from
 * the theme now in place; listed as created only the first time. The rest of AGENTS.md is the
 * author's and stays.
 */
function writeDekFiles(root: string): string[] {
  const fresh = dekFiles(root).filter((path) => !existsSync(path));
  writeAgentsMd(root);
  writeFrontmatterSchema(root);
  writeSlideTypes(root);
  return fresh;
}
