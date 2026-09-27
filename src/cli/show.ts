import { classifyAssetRef } from "../core/assets.ts";
import { cssUrls, parseCss } from "../core/css.ts";
import { deckPaths } from "../core/deck-paths.ts";
import { scanSlideHtml } from "../core/html-scan.ts";
import { readDeckFile } from "../core/resolve.ts";
import { themeExcerpt } from "../core/theme-excerpt.ts";
import { formatSectionScript } from "../core/timing.ts";
import { type ReadableDeck, type RefInfo, requireSection } from "./scope.ts";

/**
 * Everything one slide is made of, read in one call: enough to learn how it is
 * built without opening theme.css whole.
 */
export type ShowResult = {
  slug: string;
  title: string;
  script: string;
  html: string | null;
  /** `slides/<slug>.css`. */
  css: string | null;
  /** `slides/<slug>.ts`. */
  ts: string | null;
  /** The rules of the deck's theme.css this slide uses; null when the deck has no theme.css. */
  theme: string | null;
  /** Deck-relative paths of the files the slide references that exist. */
  assets: string[];
  /** Set when the deck is a ref. */
  ref?: RefInfo;
};

export function showCommand({ deck, ref }: ReadableDeck, slug: string): ShowResult {
  const section = requireSection(deck, slug);

  const paths = deckPaths(deck.dir);
  // Through the same link rules as the build: show prints nothing a build would refuse.
  const read = (path: string): string | null => readDeckFile(deck.dir, path) ?? null;
  const html = read(paths.slide(slug, ".html"));
  const css = read(paths.slide(slug, ".css"));
  const ts = read(paths.slide(slug, ".ts"));
  const themeCss = read(paths.theme);
  const scan = html === null ? undefined : scanSlideHtml(html);
  const sheet = css === null ? undefined : parseCss(css);

  const theme =
    themeCss === null
      ? null
      : themeExcerpt(parseCss(themeCss), {
          classes: scan?.classes ?? [],
          ...(scan?.layout !== undefined ? { layout: scan.layout } : {}),
          ...(sheet ? { css: sheet } : {}),
        });

  const refs = [
    ...(scan?.refs.map((ref) => ref.value) ?? []),
    ...(sheet ? cssUrls(sheet).map((url) => url.value) : []),
  ];

  return {
    slug: section.slug,
    title: section.title,
    script: formatSectionScript(section),
    html,
    css,
    ts,
    theme,
    assets: existingRefs(refs, paths.slides, deck.dir),
    ...(ref ? { ref } : {}),
  };
}

/**
 * Local references that name a file inside the deck, as sorted deck-relative
 * paths. theme.css and the slide's own files are left out: show returns them.
 */
function existingRefs(values: string[], slidesDir: string, deckDir: string): string[] {
  const found = new Set<string>();
  for (const value of values) {
    const ref = classifyAssetRef(value, { deckDir, from: slidesDir });
    if (
      ref.kind === "file" &&
      ref.deckPath !== "theme.css" &&
      !ref.deckPath.startsWith("slides/")
    ) {
      found.add(ref.deckPath);
    }
  }
  return [...found].sort();
}
