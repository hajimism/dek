import { copyFileSync } from "node:fs";
import { basename } from "node:path";
import { loadConfig } from "./config.ts";
import { renderDeckDocument } from "./document.ts";
import { type DistOptions, distFile } from "./path.ts";
import type { PlaywrightRunner } from "./playwright.ts";
import { asResolvedDeck, type ResolvedDeck } from "./resolve.ts";
import { outputPath, removeInside, writeInside } from "./safe-fs.ts";
import { coverShot } from "./shot/still.ts";
import { logicalSize } from "./size.ts";

export type BuildResult = { outPath: string } & (
  | {
      /** dist/<deck>.png, the link preview image. */
      image: string;
    }
  | {
      /** Why there is no preview image: no public URL to point og:image at, or no Playwright. */
      imageSkipped: "no-url" | "no-playwright";
    }
);

export type BuildOptions = DistOptions & {
  playerScript: string;
  /** Where dist/ is served from, ending in a slash; overrides `url` in dek.toml. */
  url?: string;
  /** For anyone with the link: the presenter view carries only what is said aloud. */
  public?: boolean;
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

  if (shot) {
    copyFileSync(shot, outputPath(imagePath, project.root));
  } else {
    // An image from an earlier build would outlive the tag that pointed at it.
    removeInside(imagePath, project.root);
  }
  const html = renderDeckDocument(deck, {
    playerScript: options.playerScript,
    target: {
      kind: "build",
      ...(options.public ? { public: true } : {}),
      ...(baseUrl
        ? {
            publicUrl: new URL(encodeURIComponent(basename(outPath)), baseUrl).href,
            ...(shot
              ? {
                  previewImage: {
                    url: new URL(encodeURIComponent(basename(imagePath)), baseUrl).href,
                    ...logicalSize(deck.deck.ratio),
                  },
                }
              : {}),
          }
        : {}),
    },
  });
  writeInside(outPath, html, project.root);
  if (shot) {
    return { outPath, image: imagePath };
  }
  return { outPath, imageSkipped: baseUrl ? "no-playwright" : "no-url" };
}
