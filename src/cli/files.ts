import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { bundledTheme } from "../core/bundled-theme.ts";
import { deckPaths } from "../core/deck-paths.ts";
import { DekError } from "../core/error.ts";
import { walkUp } from "../core/optional.ts";
import { PLAYWRIGHT_INSTALL } from "../core/playwright.ts";
import { readSourceIfExists, writeInside } from "../core/safe-fs.ts";
import { formatVoiceToml } from "../core/voice.ts";

export function defaultTheme(): string {
  return bundledTheme();
}

export function defaultToml(): string {
  return "# dek project\n";
}

/**
 * What dek keeps for itself under .dek/ while it runs: the dev server's lock, and the marks left
 * while rehearsing. Neither belongs in the repository.
 */
const LOCAL_STATE = [".dek/server.json", ".dek/marks.json"];

export function defaultGitignore(): string {
  return `# dek
dist/
.cache/
${LOCAL_STATE.join("\n")}
node_modules/
refs/
`;
}

/** The lines that ignore `entry` whole or through .dek/, with or without a leading slash. */
const ignores = (entry: string): string[] =>
  [entry, ".dek", ".dek/", ".dek/*", ".dek/**"].flatMap((line) => [line, `/${line}`]);

/**
 * Add what dek keeps for itself to the project's .gitignore, for a project made before dek kept
 * it; whether the file changed. A project with no .gitignore is left without one.
 */
export function ignoreLocalState(root: string): boolean {
  const path = join(root, ".gitignore");
  const current = readSourceIfExists(path, root);
  if (current === undefined) {
    return false;
  }
  const lines = new Set(current.split("\n").map((line) => line.trim()));
  const missing = LOCAL_STATE.filter((entry) => !ignores(entry).some((line) => lines.has(line)));
  if (missing.length === 0) {
    return false;
  }
  const separator = current === "" || current.endsWith("\n") ? "" : "\n";
  writeInside(path, `${current}${separator}${missing.join("\n")}\n`, root);
  return true;
}

export function defaultRumdl(): string {
  return `# Markdown rules for script.md
# ## is a slide. Frontmatter is allowed. Keep heading skips, line length, and broken links.
[global]
disable = ["MD041"]
`;
}

/** How to install dek into a project. The package is `@hajimism/dek`; its command is `dekc`. */
const INSTALL_DEK = "bun add -d @hajimism/dek";

/**
 * The starter script: short, but a real talk, so the first `dekc ls` already
 * shows sections, beats, and an estimate against the budget. A deck with a
 * voice starts in Japanese, the language dek's voice reads; any other in English.
 */
export function defaultScript(title: string, lang: "en" | "ja" = "en"): string {
  return `---
# yaml-language-server: $schema=../../.dek/schema.json
title: ${JSON.stringify(title)}
duration: 1m
---
${STARTER_BODY[lang]}`;
}

const STARTER_BODY = {
  en: `
## intro

Hello, and thank you for coming.
This is a starter script: read it, then make it your own talk.

> A blockquote is a note to yourself. It is neither spoken nor timed.

## How this file becomes slides {#how-it-works}

Every paragraph you write here is something you will say out loud.

### One heading, one slide {#slides}

Each level-two heading is one slide,
and the paragraphs under it are what you say while it is on screen.

### One beat, one pause {#beats}

Each level-three heading is a beat:
a pause in the speaking, and a moment where the screen can move on.

## The clock {#timing}

dek estimates how long the talk takes from these words,
and checks the estimate against the duration at the top of this file.
Run \`dekc ls\` to see the budget and the estimate side by side.

## Your turn {#next}

Rewrite these sections as your own talk.
The dev server keeps the slides in step every time you save.
`,
  // No Latin words in what is spoken: the voice would need a reading for each one.
  ja: `
## intro

こんにちは、今日は来てくださってありがとうございます。
これは最初の台本です。読んだら、自分の話に書き換えてください。

> 引用は自分へのメモです。読み上げられず、時間にも数えません。

## 台本がスライドになるまで {#how-it-works}

ここに書く段落は、どれも声に出して話す言葉です。

### 見出しひとつで一枚 {#slides}

二階層目の見出しがスライド一枚になり、
その下の段落は、そのスライドを映している間に話す内容です。

### ビートひとつで一呼吸 {#beats}

三階層目の見出しはビートです。
話の区切りであり、画面が次へ進める瞬間でもあります。

## 時間 {#timing}

話にかかる時間は、ここに書いた言葉から見積もられます。
その見積もりを、ファイルの先頭にある持ち時間と照らし合わせます。

> \`dekc ls\` で持ち時間と見積もりを並べて見る。

## あなたの番です {#next}

これらのセクションを、自分の話に書き換えてください。
開発サーバーは、保存するたびにスライドを台本に合わせます。
`,
};

/** A path init or new writes: a directory, or a file with what goes in it. */
export type PlannedPath = { path: string; contents?: string };

/** What applying a plan did: paths it wrote, and files it left because they were already there. */
export type Applied = { created: string[]; kept: string[] };

/**
 * Writes what the plan has and the disk lacks, and never overwrites. A file
 * that is already there is kept as it is, and listed when it differs from
 * what the plan would write. Every path is checked before the first write,
 * so a plan that cannot land leaves nothing behind.
 */
export function applyPlan(plan: PlannedPath[]): Applied {
  const steps = plan.map((entry) => ({ entry, state: pathState(entry) }));
  const created: string[] = [];
  const kept: string[] = [];
  for (const { entry, state } of steps) {
    if (state === "kept") {
      kept.push(entry.path);
    }
    if (state !== "missing") {
      continue;
    }
    if (entry.contents === undefined) {
      mkdirSync(entry.path, { recursive: true });
    } else {
      mkdirSync(dirname(entry.path), { recursive: true });
      // Exclusive: a file, or a dangling link a repository planted, is never written through.
      writeFileSync(entry.path, entry.contents, { flag: "wx" });
    }
    created.push(entry.path);
  }
  return { created, kept };
}

function pathState(entry: PlannedPath): "missing" | "same" | "kept" {
  const kind = entry.contents === undefined ? "directory" : "file";
  if (!placeable(entry.path, kind)) {
    return "missing";
  }
  if (entry.contents === undefined) {
    return "same";
  }
  return readFileSync(entry.path, "utf8") === entry.contents ? "same" : "kept";
}

/**
 * Checks that each file can be written where it goes, before anything is: for
 * files dek refreshes on every run, which a plan does not hold.
 */
export function checkFileSlots(paths: string[]): void {
  for (const path of paths) {
    placeable(path, "file");
  }
}

/** Whether something is already at the path; throws when it is the wrong kind of thing. */
function placeable(path: string, kind: "file" | "directory"): boolean {
  if (!existsSync(path)) {
    return false;
  }
  const isDir = statSync(path).isDirectory();
  if (kind === "directory" && !isDir) {
    throw new DekError("a file is in the way of a directory", {
      path,
      hint: "move the file aside and run again",
    });
  }
  if (kind === "file" && isDir) {
    throw new DekError("a directory is in the way of a file", {
      path,
      hint: "move the directory aside and run again",
    });
  }
  return true;
}

/**
 * A deck's files: its directories, the starter script, the theme it starts
 * from, and voice settings when the project has a voice. The skeleton slides
 * are sync's to write, once the theme they are drawn in is in place.
 */
export function deckPlan(
  root: string,
  name: string,
  theme: string,
  voice?: { engine: string; speaker: string; speed?: number },
): PlannedPath[] {
  const paths = deckPaths(join(root, "decks", name));
  const script = defaultScript(name, voice ? "ja" : "en");
  const plan: PlannedPath[] = [
    { path: paths.slides },
    { path: paths.assets },
    { path: paths.script, contents: script },
    { path: paths.theme, contents: theme },
  ];
  if (voice) {
    plan.push(
      { path: paths.voiceToml, contents: formatVoiceToml(voice) },
      { path: paths.voiceDict, contents: "# voice dictionary\n" },
    );
  }
  return plan;
}

/**
 * The commands to run next, from `cwd`, exactly as they can be pasted: dek
 * installed into the project unless it already resolves there, then into the
 * deck to write the script and start the dev server, or a first deck to add.
 */
export function nextSteps(cwd: string, root: string, deckDir?: string): string[] {
  const steps: string[] = [];
  let at = cwd;
  const go = (dir: string): void => {
    const path = relative(at, dir);
    if (path) {
      steps.push(`cd ${shellQuote(path.length <= dir.length ? path : dir)}`);
    }
    at = dir;
  };
  if (!hasLocalDek(root)) {
    go(root);
    steps.push(INSTALL_DEK);
  }
  if (!deckDir) {
    return [...steps, "bunx dekc new <name>"];
  }
  go(deckDir);
  return [...steps, "$EDITOR script.md", "bunx dekc"];
}

/** Whether `bunx dekc` in the project runs this dek: bunx looks in node_modules/.bin up the tree. */
function hasLocalDek(root: string): boolean {
  return inNodeModules(root, ".bin", "dekc");
}

/**
 * The Playwright install, until the project has it: shots, the PDF, and the rendered lint rules
 * need it, and dek does not bring it along.
 */
export function playwrightStep(root: string): string | undefined {
  return inNodeModules(root, "playwright", "package.json") ? undefined : PLAYWRIGHT_INSTALL;
}

/** Whether node_modules holds `path` in `root` or a directory above it, as Bun resolves it. */
function inNodeModules(root: string, ...path: string[]): boolean {
  return (
    walkUp(root, (dir) => existsSync(join(dir, "node_modules", ...path)) || undefined) === true
  );
}

/** `word` as one shell word: as it is when that is safe, else single-quoted. */
export function shellQuote(word: string): string {
  return /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`;
}
