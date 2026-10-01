import {
  type CssToken,
  cssClassNames,
  cssLayoutNames,
  publishedTokens,
  type Stylesheet,
} from "./css.ts";

export type ThemeLayout = { name: string; example?: string };

/**
 * What a theme offers a slide, read once: AGENTS.md, `dekc theme`, and lint all say the same
 * thing about it because they all read it here.
 */
export type ThemeFacts = {
  /** Every class the theme's selectors name. */
  classes: Set<string>;
  /** The layouts it styles, by name, each with its example markup when it has one. */
  layouts: ThemeLayout[];
  /** The tokens every slide can `var()`, with their values, in source order. */
  tokens: CssToken[];
};

export function themeFacts(sheet: Stylesheet): ThemeFacts {
  return {
    classes: cssClassNames(sheet),
    layouts: themeLayouts(sheet),
    tokens: publishedTokens(sheet),
  };
}

const LAYOUT_EXAMPLE_RE = /\/\*\s*@layout\s+([A-Za-z0-9_-]+)[ \t]*\r?\n([\s\S]*?)\*\//g;

/**
 * The layouts a theme defines, sorted by name, each with the markup its
 * `/* @layout <name> ... *\/` comment gives. A theme documents how a layout
 * expects to be filled that way, and the example travels with the theme.
 */
function themeLayouts(sheet: Stylesheet): ThemeLayout[] {
  const examples = new Map<string, string>();
  for (const match of sheet.source.matchAll(LAYOUT_EXAMPLE_RE)) {
    const [, name, body] = match;
    if (name && body !== undefined && !examples.has(name)) {
      examples.set(name, body.trim());
    }
  }
  return [...cssLayoutNames(sheet)].sort().map((name) => {
    const example = examples.get(name);
    return example === undefined ? { name } : { name, example };
  });
}
