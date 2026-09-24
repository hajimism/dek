import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defaultRumdl } from "../../src/cli/files.ts";
import { withTempDir } from "./fs.ts";

export type DeckSpec = {
  name: string;
  script?: string;
  slides?: Record<string, string>;
  /** `slides/<slug>.css`, the slide's own stylesheet. */
  styles?: Record<string, string>;
  theme?: string;
  assets?: Record<string, string>;
};

export type ProjectSpec = {
  theme?: string;
  toml?: string;
  decks?: DeckSpec[];
  assets?: Record<string, string>;
};

export function defaultScript(title = "Demo"): string {
  return `---
title: ${title}
---

## intro

hello
`;
}

export async function writeProject(root: string, spec: ProjectSpec = {}): Promise<void> {
  await writeFile(join(root, "dek.toml"), spec.toml ?? "# test project\n");
  await writeFile(join(root, ".rumdl.toml"), defaultRumdl());
  await mkdir(join(root, "assets"), { recursive: true });
  await mkdir(join(root, "decks"), { recursive: true });
  if (spec.theme !== undefined) {
    await writeFile(join(root, "theme.css"), spec.theme);
  }
  await writeAssets(join(root, "assets"), spec.assets);
  for (const deck of spec.decks ?? []) {
    await writeDeck(root, deck);
  }
}

export async function withTempProject<T>(
  spec: ProjectSpec,
  fn: (root: string) => Promise<T>,
): Promise<T> {
  return withTempDir(async (dir) => {
    await writeProject(dir, spec);
    return fn(dir);
  });
}

async function writeDeck(root: string, spec: DeckSpec): Promise<void> {
  const dir = join(root, "decks", spec.name);
  await mkdir(join(dir, "slides"), { recursive: true });
  await mkdir(join(dir, "assets"), { recursive: true });
  await writeFile(join(dir, "script.md"), spec.script ?? defaultScript());
  if (spec.theme !== undefined) {
    await writeFile(join(dir, "theme.css"), spec.theme);
  }
  await writeAssets(join(dir, "assets"), spec.assets);
  for (const [slug, html] of Object.entries(spec.slides ?? {})) {
    await writeFile(join(dir, "slides", `${slug}.html`), html);
  }
  for (const [slug, css] of Object.entries(spec.styles ?? {})) {
    await writeFile(join(dir, "slides", `${slug}.css`), css);
  }
}

async function writeAssets(dir: string, assets?: Record<string, string>): Promise<void> {
  for (const [name, contents] of Object.entries(assets ?? {})) {
    const path = join(dir, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
  }
}
