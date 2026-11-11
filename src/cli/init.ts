import { existsSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import pkg from "../../package.json";
import { parseCss, publishedTokens } from "../core/css.ts";
import { deckPaths } from "../core/deck-paths.ts";
import { DekError } from "../core/error.ts";
import { shellQuote } from "../core/escape.ts";
import { REQUIRED_TOKENS } from "../core/lint/tokens.ts";
import { walkUp } from "../core/optional.ts";
import { DECK_NAME_HINT, isDeckName } from "../core/path.ts";
import { refuseInsideRef } from "../core/ref.ts";
import { readSourceIfExists } from "../core/safe-fs.ts";
import { runPiped } from "../core/spawn.ts";
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
  hasLocalDek,
  nextSteps,
  type PlannedPath,
  playwrightStep,
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
  /** The installs init ran in the project, as a person would type them. */
  installed?: string[];
  /** The installs that failed or could not run: the project is there, and `next` installs dek. */
  notInstalled?: NotInstalled[];
  /** The Playwright install, when the project lacks it: `dekc shot`, `dekc pdf`, and `--visual` need it. */
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

  const planned = applyPlan(projectPlan(root, options.deck));
  const created = planned.created;
  // A package.json is the project's own once installs write to it: keeping it is no news.
  const kept = planned.kept.filter((path) => path !== join(root, "package.json"));
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

/** An install init could not finish, and why. */
type NotInstalled = { install: "dek" | "browser"; reason: string };

/** Runs one install in the project: `argv[0]` is bun. */
export type InstallRun = (
  argv: string[],
  cwd: string,
) => Promise<{ exitCode: number; stderr: string }>;

/** One install init runs: what a person would type, and what dek runs for it. */
type InstallStep = { shown: string; argv: string[] };

/** A browser download is the long one; nothing init installs should take longer. */
const INSTALL_TIMEOUT_MS = 10 * 60_000;

const runInstall: InstallRun = (argv, cwd) =>
  runPiped(argv, {
    label: `bun ${argv.slice(1).join(" ")} did not finish`,
    hint: "check that bun runs, or pass --no-install and install dek yourself",
    timeoutMs: INSTALL_TIMEOUT_MS,
    cwd,
  });

/**
 * `dekc init`: the project as `initCommand` writes it, then dek installed into it, pinned to the
 * version that is running, which is the code the author just ran. With `browser`, Playwright and
 * its Chromium follow. An install that fails leaves the project as written and is listed in
 * `notInstalled`; `next` then names the install to run.
 */
export async function initProject(options: {
  cwd: string;
  dir?: string;
  deck?: string;
  /** Install dek into the project; true unless the author passes --no-install. */
  install?: boolean;
  /** Install Playwright and Chromium too, for `--visual`, `dekc shot`, and `dekc pdf`. */
  browser?: boolean;
  run?: InstallRun;
}): Promise<InitResult> {
  const root = resolve(options.cwd, options.dir ?? ".");
  const install = options.install ?? true;
  // dek finds Playwright beside its own install, so a browser for a project without dek in it
  // would be one no dek command uses.
  if (options.browser && !install && !hasLocalDek(root)) {
    throw new DekError("--browser needs dek installed in the project", {
      hint: "drop --no-install, or run `bun add -d @hajimism/dek` in the project first",
    });
  }
  const result = initCommand(options);
  const run = options.run ?? runInstall;
  const installed: string[] = [];
  const notInstalled: NotInstalled[] = [];
  const runSteps = async (
    install: NotInstalled["install"],
    steps: InstallStep[],
  ): Promise<boolean> => {
    for (const step of steps) {
      const failure = await failureOf(run, step, root);
      if (failure !== undefined) {
        notInstalled.push({ install, reason: `${step.shown} failed: ${failure}` });
        return false;
      }
      installed.push(step.shown);
    }
    return true;
  };
  const dekReady =
    hasLocalDek(root) ||
    (install && (await runSteps("dek", [bunAdd(`@hajimism/dek@${pkg.version}`)])));
  if (options.browser && playwrightStep(root) !== undefined) {
    if (dekReady) {
      await runSteps("browser", [
        bunAdd("playwright"),
        // --bun: Playwright's CLI asks for node, which a Bun-only machine may lack.
        {
          shown: "bunx --bun playwright install chromium",
          argv: [process.execPath, "x", "--bun", "playwright", "install", "chromium"],
        },
      ]);
    } else {
      notInstalled.push({ install: "browser", reason: "dek is not installed in the project" });
    }
  }
  const deckDir = options.deck ? join(root, "decks", options.deck) : undefined;
  const playwright = playwrightStep(root);
  const { playwright: _before, ...rest } = result;
  return {
    ...rest,
    next: nextSteps(options.cwd, root, deckDir),
    ...(installed.length > 0 ? { installed } : {}),
    ...(notInstalled.length > 0 ? { notInstalled } : {}),
    ...(playwright ? { playwright } : {}),
  };
}

function bunAdd(spec: string): InstallStep {
  return { shown: `bun add -d ${spec}`, argv: [process.execPath, "add", "--dev", spec] };
}

/** Why `step` failed: the last line it wrote on stderr, or why it could not run; nothing when it ran. */
async function failureOf(
  run: InstallRun,
  step: InstallStep,
  cwd: string,
): Promise<string | undefined> {
  try {
    const ran = await run(step.argv, cwd);
    if (ran.exitCode === 0) {
      return undefined;
    }
    const lines = ran.stderr
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.at(-1) ?? `exit code ${ran.exitCode}`;
  } catch (error) {
    if (error instanceof DekError) {
      return error.message;
    }
    throw error;
  }
}

/** The tokens every deck needs that the project's theme.css does not publish on `.slide`. */
function missingThemeTokens(root: string): string[] {
  const published = new Set(
    publishedTokens(parseCss(readSourceIfExists(join(root, "theme.css"), root) ?? "")).map(
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
  // A first deck is drawn in the theme that will be there: the one kept, or dek's. A folder that
  // is not there yet holds no theme.
  const theme =
    (existsSync(root) ? readSourceIfExists(themePath, root) : undefined) ?? defaultTheme();
  return [
    { path: join(root, "dek.toml"), contents: defaultToml() },
    { path: themePath, contents: defaultTheme() },
    { path: join(root, ".rumdl.toml"), contents: defaultRumdl() },
    { path: join(root, ".gitignore"), contents: defaultGitignore() },
    { path: join(root, "tsconfig.json"), contents: defaultTsconfig() },
    // The install lands here, not in a package.json of a repository the project sits in.
    { path: join(root, "package.json"), contents: '{\n  "private": true\n}\n' },
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
  // A ref is someone else's project, read where it is: init would write its files into it.
  refuseInsideRef(root);
  const outer = walkUp(root, (dir) => {
    const config = join(dir, "dek.toml");
    return existsSync(config) && statSync(config).isFile() ? dir : undefined;
  });
  if (outer !== undefined && outer !== root) {
    throw new DekError(`already inside the dek project at ${outer}`, {
      path: join(outer, "dek.toml"),
      hint: `add a deck to that project with \`dekc new ${shellQuote(basename(root))}\`, or run init outside it`,
    });
  }
}
