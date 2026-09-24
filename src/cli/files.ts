import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { syncDeck } from "../core/sync.ts";
import { formatVoiceToml } from "../core/voice.ts";

const defaultThemePath = join(import.meta.dir, "..", "theme", "default.css");

export function defaultTheme(): string {
  return readFileSync(defaultThemePath, "utf8");
}

export function defaultToml(): string {
  return "# dek project\n";
}

export function defaultGitignore(): string {
  return `# dek
dist/
.cache/
.dek/server.json
node_modules/
`;
}

export function defaultRumdl(): string {
  return `# Markdown rules for script.md
# ## is a slide. Frontmatter is allowed. Keep heading skips, line length, and broken links.
[global]
disable = ["MD041"]
`;
}

export function defaultScript(title: string): string {
  return `---
# yaml-language-server: $schema=../../.dek/schema.json
title: ${JSON.stringify(title)}
---

## intro
`;
}

export function ensureDir(path: string): boolean {
  if (existsSync(path)) {
    return false;
  }
  mkdirSync(path, { recursive: true });
  return true;
}

export function writeIfMissing(path: string, contents: string): boolean {
  if (existsSync(path)) {
    return false;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  return true;
}

export function copyIfMissing(from: string, to: string): boolean {
  if (existsSync(to)) {
    return false;
  }
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  return true;
}

export function trackWrite(created: string[], path: string, wrote: boolean): void {
  if (wrote) {
    created.push(path);
  }
}

export function createDeck(
  root: string,
  name: string,
  themeSource: string,
  voice?: { engine: string; speaker: string; speed?: number },
): string[] {
  const dir = join(root, "decks", name);
  const created: string[] = [];
  trackWrite(created, join(dir, "slides"), ensureDir(join(dir, "slides")));
  trackWrite(created, join(dir, "assets"), ensureDir(join(dir, "assets")));
  trackWrite(
    created,
    join(dir, "script.md"),
    writeIfMissing(join(dir, "script.md"), defaultScript(name)),
  );
  trackWrite(created, join(dir, "theme.css"), copyIfMissing(themeSource, join(dir, "theme.css")));
  if (voice) {
    trackWrite(
      created,
      join(dir, "voice", "voice.toml"),
      writeIfMissing(join(dir, "voice", "voice.toml"), formatVoiceToml(voice)),
    );
    trackWrite(
      created,
      join(dir, "voice", "dict.toml"),
      writeIfMissing(join(dir, "voice", "dict.toml"), "# voice dictionary\n"),
    );
  }
  // A new deck passes lint as created: its skeleton slides and AGENTS.md come with it.
  created.push(...syncDeck(dir).created, join(root, "AGENTS.md"));
  return created;
}
