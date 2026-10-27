import { existsSync } from "node:fs";
import { type CssToken, parseCss } from "../core/css.ts";
import { deckPaths } from "../core/deck-paths.ts";
import { DekError } from "../core/error.ts";
import { isPlainWord } from "../core/escape.ts";
import { foreignList } from "../core/foreign-text.ts";
import { listShown, unprinted } from "../core/prose.ts";
import { readDeckFile } from "../core/resolve.ts";
import { type ThemeLayout, themeFacts } from "../core/theme-facts.ts";
import type { ReadableDeck, RefInfo } from "./scope.ts";

export type ThemeResult = {
  /** The deck's theme.css: the one lint and the slides use. */
  path: string;
  /** The classes slide markup may use; what `max_classes` counts. */
  classes: string[];
  /** The state classes the theme selects that the player sets at runtime; never in markup. */
  stateClasses: string[];
  /** The tokens every slide can `var()`. */
  tokens: CssToken[];
  /** The layouts whose names are plain words. A name is the theme's text, maybe a pack's. */
  layouts: ThemeLayout[];
  /** How many layouts the theme has whose names are no plain word, left out of `layouts`. */
  unprintedLayouts?: number;
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
      hint: "copy the project theme.css into the deck, or run `dekc new <name>` for a fresh deck",
    });
  }
  const { classes, stateClasses, layouts, tokens } = themeFacts(
    parseCss(readDeckFile(deck.dir, path) ?? ""),
  );
  const printed = layouts.filter((layout) => isPlainWord(layout.name));
  const left = layouts.length - printed.length;
  const result: ThemeResult = {
    path,
    classes: [...classes].sort(),
    stateClasses: [...stateClasses].sort(),
    tokens,
    layouts: printed,
    ...(left > 0 ? { unprintedLayouts: left } : {}),
    ...(ref ? { ref } : {}),
  };
  if (!name) {
    return result;
  }
  const layout = layouts.find((entry) => entry.name === name);
  if (!layout) {
    throw layoutNotFound(name, layouts, path, ref);
  }
  if (layout.example === undefined) {
    throw new DekError(`layout "${name}" has no example in theme.css`, {
      path,
      hint: ref
        ? `a ref is read-only; read the markup of a slide that uses it with \`dekc show ${ref.name} <slug>\``
        : `add a /* @layout ${name} ... */ comment with its markup above .slide[data-layout="${name}"]`,
    });
  }
  return { ...result, layout: { name, example: layout.example } };
}

/**
 * A layout the theme does not define, named among the layouts whose names are plain words. A
 * ref's layout names are its author's, so for a ref they go in the message, as foreignList shows
 * them, and the hint is dek's words.
 */
function layoutNotFound(
  name: string,
  layouts: ThemeLayout[],
  path: string,
  ref: RefInfo | undefined,
): DekError {
  const names = layouts.map((entry) => entry.name);
  if (!ref) {
    return new DekError(`layout "${name}" is not defined in theme.css`, {
      path,
      hint: `use one of: ${listShown(names, isPlainWord, unprinted) || "(none)"}`,
    });
  }
  const shown = names.filter(isPlainWord);
  const left = names.length - shown.length;
  const others = left > 0 ? unprinted(left) : "";
  const defined =
    shown.length === 0
      ? others
      : others
        ? `${foreignList(shown)}, and ${others}`
        : foreignList(shown);
  return shown.length > 0
    ? new DekError(`layout "${name}" is not defined in theme.css, which defines ${defined}`, {
        path,
        hint: `pass one of them: \`dekc theme ${ref.name} <layout>\``,
      })
    : new DekError(
        `layout "${name}" is not defined in theme.css, which defines ${defined || "none"}`,
        { path, hint: `read the markup of a slide with \`dekc show ${ref.name} <slug>\`` },
      );
}
