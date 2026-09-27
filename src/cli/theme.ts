import { existsSync } from "node:fs";
import { type CssToken, parseCss } from "../core/css.ts";
import { deckPaths } from "../core/deck-paths.ts";
import { DekError } from "../core/error.ts";
import { readDeckFile } from "../core/resolve.ts";
import { type ThemeLayout, themeFacts } from "../core/theme-facts.ts";
import type { ReadableDeck, RefInfo } from "./scope.ts";

export type ThemeResult = {
  /** The deck's theme.css: the one lint and the slides use. */
  path: string;
  classes: string[];
  /** The tokens every slide can `var()`. */
  tokens: CssToken[];
  layouts: ThemeLayout[];
  /** Set when one layout was asked for; text output prints its example alone. */
  layout?: { name: string; example: string };
  /** Set when the deck is a ref. */
  ref?: RefInfo;
};

/** The deck's theme, or one layout's example markup when `name` is given. */
export function themeCommand({ deck, ref }: ReadableDeck, name?: string): ThemeResult {
  const path = deckPaths(deck.dir).theme;
  if (!existsSync(path)) {
    throw new DekError("theme.css not found", {
      path,
      hint: "copy the project theme.css into the deck, or run `dek new <name>` for a fresh deck",
    });
  }
  const { classes, layouts, tokens } = themeFacts(parseCss(readDeckFile(deck.dir, path) ?? ""));
  const result: ThemeResult = {
    path,
    classes: [...classes].sort(),
    tokens,
    layouts,
    ...(ref ? { ref } : {}),
  };
  if (!name) {
    return result;
  }
  const layout = layouts.find((entry) => entry.name === name);
  if (!layout) {
    throw new DekError(`layout "${name}" is not defined in theme.css`, {
      path,
      hint: `use one of: ${layouts.map((entry) => entry.name).join(", ") || "(none)"}`,
    });
  }
  if (layout.example === undefined) {
    throw new DekError(`layout "${name}" has no example in theme.css`, {
      path,
      hint: `add a /* @layout ${name} ... */ comment with its markup above .slide[data-layout="${name}"]`,
    });
  }
  return { ...result, layout: { name, example: layout.example } };
}
