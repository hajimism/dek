import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadConfig } from "./config.ts";
import { renderDeckDocument } from "./document.ts";
import { type DistOptions, distFile } from "./path.ts";
import { asResolvedDeck, type ResolvedDeck } from "./resolve.ts";

export type BuildResult = {
  outPath: string;
};

export type BuildOptions = DistOptions & {
  playerScript: string;
};

export async function buildDeck(dir: string, options: BuildOptions): Promise<BuildResult>;
export async function buildDeck(source: ResolvedDeck, options: BuildOptions): Promise<BuildResult>;
export async function buildDeck(
  input: string | ResolvedDeck,
  options: BuildOptions,
): Promise<BuildResult> {
  const { project, deck } = asResolvedDeck(input);
  const html = await renderDeckDocument(deck, {
    mode: "player",
    inlineAssets: true,
    config: loadConfig(project.configPath),
    playerScript: options.playerScript,
  });
  const outPath = distFile(project, deck, "html", options);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html);
  return { outPath };
}
