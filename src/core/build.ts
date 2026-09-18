import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadConfig } from "./config.ts";
import { renderDeckDocument } from "./document.ts";
import { type Project, type ProjectDeck, resolveDeck } from "./resolve.ts";

export type BuildResult = {
  outPath: string;
};

export async function buildDeck(
  dir: string,
  options: { playerScript: string },
): Promise<BuildResult> {
  const { project, deck } = resolveDeck(dir);
  return writeBuiltDeck(project, deck, options.playerScript);
}

export async function buildProjectDeck(
  project: Project,
  deck: ProjectDeck,
  options: { playerScript: string },
): Promise<BuildResult> {
  return writeBuiltDeck(project, deck, options.playerScript);
}

async function writeBuiltDeck(
  project: Project,
  deck: ProjectDeck,
  playerScript: string,
): Promise<BuildResult> {
  const html = await renderDeckDocument(deck, {
    mode: "player",
    inlineAssets: true,
    config: loadConfig(project.configPath),
    playerScript,
  });
  const outPath = join(project.root, "dist", `${deck.name}.html`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html);
  return { outPath };
}
