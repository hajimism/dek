import { join } from "node:path";
import { classifyAssetRef } from "../core/assets.ts";
import { cssUrls, themeExcerpt } from "../core/css.ts";
import { scanSlideHtml } from "../core/html.ts";
import { DekError } from "../core/index.ts";
import { readTextIfExists } from "../core/resolve.ts";
import { formatSectionScript } from "../core/timing.ts";
import { type RefInfo, requireReadableDeck, requireSection } from "./scope.ts";

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

export function showCommand(options: { cwd: string; slug?: string; deck?: string }): ShowResult {
  const slug = options.slug?.trim();
  if (!slug) {
    throw new DekError("usage: dek show <slug>", { hint: "run `dek ls` to see the slugs" });
  }

  const { deck, ref } = requireReadableDeck(options.cwd, options.deck);
  const section = requireSection(deck, slug);

  const slidesDir = join(deck.dir, "slides");
  const html = readIfExists(join(slidesDir, `${slug}.html`));
  const css = readIfExists(join(slidesDir, `${slug}.css`));
  const ts = readIfExists(join(slidesDir, `${slug}.ts`));
  const themeCss = readIfExists(join(deck.dir, "theme.css"));
  const scan = html === null ? undefined : scanSlideHtml(html);

  const theme =
    themeCss === null
      ? null
      : themeExcerpt(themeCss, {
          classes: scan?.classes ?? [],
          ...(scan?.layout !== undefined ? { layout: scan.layout } : {}),
          ...(css !== null ? { css } : {}),
        });

  const refs = [
    ...(scan?.refs.map((ref) => ref.value) ?? []),
    ...(css === null ? [] : cssUrls(css).map((url) => url.value)),
  ];

  return {
    slug: section.slug,
    title: section.title,
    script: formatSectionScript(section),
    html,
    css,
    ts,
    theme,
    assets: existingRefs(refs, slidesDir, deck.dir),
    ...(ref ? { ref } : {}),
  };
}

function readIfExists(path: string): string | null {
  return readTextIfExists(path) ?? null;
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
