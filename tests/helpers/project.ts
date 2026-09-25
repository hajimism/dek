import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defaultRumdl, defaultTheme } from "../../src/cli/files.ts";
import { withTempDir } from "./fs.ts";

export type DeckSpec = {
  name: string;
  script?: string;
  slides?: Record<string, string>;
  /** `slides/<slug>.css`, the slide's own stylesheet. */
  styles?: Record<string, string>;
  /** `slides/<slug>.ts`, the slide's motion module. */
  scripts?: Record<string, string>;
  /** theme.css; the default theme when omitted, as `dek new` leaves it, and `null` for none. */
  theme?: string | null;
  assets?: Record<string, string>;
};

/** A ref snapshot laid out under `refs/owner/repo/deck`, as `dek ref` leaves it. */
export type RefSpec = {
  name: string;
  rev?: string;
  deck?: Omit<DeckSpec, "name">;
  /** The source project's dek.toml, copied into the snapshot. */
  toml?: string;
  license?: string;
  /** Pin it in the project's dek.toml; defaults to true. */
  declared?: boolean;
  /** Write the snapshot files; defaults to true. */
  fetched?: boolean;
};

export type ProjectSpec = {
  theme?: string;
  toml?: string;
  decks?: DeckSpec[];
  assets?: Record<string, string>;
  refs?: RefSpec[];
};

export const REF_SHA = "0123456789abcdef0123456789abcdef01234567";

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
  await writeRefs(root, spec);
}

async function writeRefs(root: string, spec: ProjectSpec): Promise<void> {
  const declared = (spec.refs ?? []).filter((ref) => ref.declared !== false);
  if (declared.length > 0) {
    const lines = declared.map((ref) => `"${ref.name}" = "${ref.rev ?? REF_SHA}"`);
    await writeFile(
      join(root, "dek.toml"),
      `${spec.toml ?? "# test project\n"}\n[refs]\n${lines.join("\n")}\n`,
    );
  }
  for (const ref of spec.refs ?? []) {
    if (ref.fetched === false) {
      continue;
    }
    const [owner = "", repo = "", deck = ""] = ref.name.split("/");
    const dir = join(root, "refs", owner, repo, deck);
    await mkdir(join(dir, "decks"), { recursive: true });
    await writeFile(join(dir, "dek.toml"), ref.toml ?? "");
    await writeFile(
      join(dir, ".ref.json"),
      `${JSON.stringify({ name: ref.name, rev: ref.rev ?? REF_SHA, path: `decks/${deck}` })}\n`,
    );
    if (ref.license !== undefined) {
      await writeFile(join(dir, "LICENSE"), ref.license);
    }
    await writeDeck(dir, { ...ref.deck, name: deck });
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
  const theme = spec.theme === undefined ? defaultTheme() : spec.theme;
  if (theme !== null) {
    await writeFile(join(dir, "theme.css"), theme);
  }
  await writeAssets(join(dir, "assets"), spec.assets);
  for (const [slug, html] of Object.entries(spec.slides ?? {})) {
    await writeFile(join(dir, "slides", `${slug}.html`), html);
  }
  for (const [slug, css] of Object.entries(spec.styles ?? {})) {
    await writeFile(join(dir, "slides", `${slug}.css`), css);
  }
  for (const [slug, ts] of Object.entries(spec.scripts ?? {})) {
    await writeFile(join(dir, "slides", `${slug}.ts`), ts);
  }
}

async function writeAssets(dir: string, assets?: Record<string, string>): Promise<void> {
  for (const [name, contents] of Object.entries(assets ?? {})) {
    const path = join(dir, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
  }
}
