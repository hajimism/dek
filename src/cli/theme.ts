import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cssClassNames, cssTokenValues, type ThemeLayout, themeLayouts } from "../core/css.ts";
import { DekError } from "../core/error.ts";
import { type RefInfo, requireReadableDeck } from "./scope.ts";

export type ThemeResult = {
  /** The deck's theme.css: the one lint and the slides use. */
  path: string;
  classes: string[];
  tokens: Array<{ name: string; value: string }>;
  layouts: ThemeLayout[];
  /** Set when one layout was asked for; text output prints its example alone. */
  layout?: { name: string; example: string };
  /** Set when the deck is a ref. */
  ref?: RefInfo;
};

export function themeCommand(options: {
  cwd: string;
  deck?: string;
  layout?: string;
}): ThemeResult {
  const { deck, ref } = requireReadableDeck(options.cwd, options.deck);
  const path = join(deck.dir, "theme.css");
  if (!existsSync(path)) {
    throw new DekError("theme.css not found", {
      path,
      hint: "copy the project theme.css into the deck, or run `dek new <name>` for a fresh deck",
    });
  }
  const css = readFileSync(path, "utf8");
  const layouts = themeLayouts(css);
  const result: ThemeResult = {
    path,
    classes: [...cssClassNames(css)].sort(),
    tokens: cssTokenValues(css),
    layouts,
    ...(ref ? { ref } : {}),
  };
  const name = options.layout?.trim();
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
