import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { loadConfig } from "./config.ts";
import { renderDeckDocument } from "./document.ts";
import { type DistOptions, distFile } from "./path.ts";
import type { PlaywrightRunner } from "./playwright.ts";
import { asResolvedDeck, type ResolvedDeck } from "./resolve.ts";
import { coverShot } from "./shot.ts";
import { logicalSize } from "./size.ts";

export type BuildResult = {
  outPath: string;
  /** dist/<deck>.png, the link preview image, when the build could take one. */
  image?: string;
  /** Why there is no preview image: no public URL to point og:image at, or no Playwright. */
  imageSkipped?: "no-url" | "no-playwright";
};

export type BuildOptions = DistOptions & {
  playerScript: string;
  /** Where dist/ is served from, ending in a slash; overrides `url` in dek.toml. */
  url?: string;
  runner?: PlaywrightRunner;
};

export async function buildDeck(dir: string, options: BuildOptions): Promise<BuildResult>;
export async function buildDeck(source: ResolvedDeck, options: BuildOptions): Promise<BuildResult>;
export async function buildDeck(
  input: string | ResolvedDeck,
  options: BuildOptions,
): Promise<BuildResult> {
  const { project, deck } = asResolvedDeck(input);
  const config = loadConfig(project.configPath);
  const outPath = distFile(project, deck, "html", options);
  const imagePath = distFile(project, deck, "png", options);
  const baseUrl = options.url ?? config.url;
  const shot = baseUrl ? await coverShot(deck, options.runner) : undefined;

  mkdirSync(dirname(outPath), { recursive: true });
  if (shot) {
    copyFileSync(shot, imagePath);
  } else {
    // An image from an earlier build would outlive the tag that pointed at it.
    rmSync(imagePath, { force: true });
  }
  const html = await renderDeckDocument(deck, {
    mode: "player",
    inlineAssets: true,
    config,
    playerScript: options.playerScript,
    ...(baseUrl
      ? {
          publicUrl: new URL(basename(outPath), baseUrl).href,
          ...(shot
            ? {
                previewImage: {
                  url: new URL(basename(imagePath), baseUrl).href,
                  ...logicalSize(deck.deck.ratio),
                },
              }
            : {}),
        }
      : {}),
  });
  writeFileSync(outPath, html);
  if (shot) {
    return { outPath, image: imagePath };
  }
  return { outPath, imageSkipped: baseUrl ? "no-playwright" : "no-url" };
}
