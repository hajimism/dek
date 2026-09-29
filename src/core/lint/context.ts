import { type DekConfig, loadConfig } from "../config.ts";
import { cssLayoutNames, parseCss, type Stylesheet } from "../css.ts";
import { deckPaths } from "../deck-paths.ts";
import type { Diagnostic } from "../diagnostic.ts";
import { type HtmlScan, scanSlideHtml } from "../html-scan.ts";
import { type ScriptParts, splitFrontmatter } from "../parse.ts";
import {
  listSlideFiles,
  listSlides,
  type Project,
  type ProjectDeck,
  readDeckFile,
} from "../resolve.ts";
import type { Section } from "../schema.ts";
import { skeletonHtml } from "../skeleton.ts";
import { type ThemeFacts, themeFacts } from "../theme-facts.ts";

type SlideFile = { slug: string; path: string };

type SlideSource = { html: string; scan: HtmlScan; skeleton: boolean };

/**
 * What every rule reads: the deck, its config, and the files beside script.md. Rules see every
 * slide; `lintDeck` narrows their findings to one slide when asked.
 */
export type LintContext = DeckFiles & {
  /** DEK016 and DEK017 of each slide script, by slug: evaluated before the rules run. */
  scripts: Map<string, Diagnostic[]>;
};

/** The deck as read from disk, each file once. */
export type DeckFiles = {
  project: Project;
  deck: ProjectDeck;
  config: DekConfig;
  /** script.md, read once and cut at its frontmatter; none when it cannot be cut. */
  script?: ScriptParts;
  /** The first section of each slug, in script order; a second one is DEK004. */
  sectionsBySlug: Map<string, Section>;
  slidesBySlug: Map<string, SlideFile>;
  stylesBySlug: Map<string, SlideFile>;
  /** theme.css, parsed once for every rule that reads it. */
  theme?: ThemeFacts & { path: string; sheet: Stylesheet };
  /** A slide's HTML, read and scanned once, and whether it is still the skeleton `dek sync` wrote. */
  slideSource(slug: string): SlideSource | undefined;
  /** A slide's own stylesheet, read and parsed once for every rule that reads it. */
  slideStyle(slug: string): { path: string; sheet: Stylesheet } | undefined;
};

export function readDeckFiles(project: Project, deck: ProjectDeck): DeckFiles {
  const themePath = deckPaths(deck.dir).theme;
  const themeCss = readDeckFile(deck.dir, themePath);
  const sectionsBySlug = new Map<string, Section>();
  for (const section of deck.deck.sections) {
    if (!sectionsBySlug.has(section.slug)) {
      sectionsBySlug.set(section.slug, section);
    }
  }
  const slidesBySlug = new Map(listSlides(deck.dir).map((slide) => [slide.slug, slide]));
  const sources = new Map<string, SlideSource | undefined>();
  const stylesBySlug = new Map(listSlideFiles(deck.dir, ".css").map((file) => [file.slug, file]));
  const styles = new Map<string, { path: string; sheet: Stylesheet } | undefined>();
  const sheet = themeCss === undefined ? undefined : parseCss(themeCss);
  const layouts = sheet === undefined ? new Set<string>() : cssLayoutNames(sheet);
  const script = scriptParts(deck);
  return {
    project,
    deck,
    config: loadConfig(project.configPath),
    ...(script ? { script } : {}),
    sectionsBySlug,
    slidesBySlug,
    stylesBySlug,
    ...(sheet === undefined
      ? {}
      : {
          theme: { path: themePath, sheet, ...themeFacts(sheet) },
        }),
    slideSource(slug) {
      if (!sources.has(slug)) {
        const slide = slidesBySlug.get(slug);
        const html = slide && readDeckFile(deck.dir, slide.path);
        sources.set(
          slug,
          html === undefined
            ? undefined
            : {
                html,
                scan: scanSlideHtml(html),
                skeleton: html === skeletonHtml(deck.deck, slug, layouts),
              },
        );
      }
      return sources.get(slug);
    },
    slideStyle(slug) {
      if (!styles.has(slug)) {
        const style = stylesBySlug.get(slug);
        const css = style && readDeckFile(deck.dir, style.path);
        styles.set(
          slug,
          style && css !== undefined ? { path: style.path, sheet: parseCss(css) } : undefined,
        );
      }
      return styles.get(slug);
    },
  };
}

function scriptParts(deck: ProjectDeck): ScriptParts | undefined {
  try {
    return splitFrontmatter(readDeckFile(deck.dir, deck.scriptPath) ?? "", deck.scriptPath);
  } catch {
    return undefined;
  }
}
