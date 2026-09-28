import {
  type CssToken,
  cssAtRuleNames,
  cssStyleSelectors,
  cssUrls,
  isScopedThemeSelector,
  outermostSelectors,
  publishedTokens,
  type Stylesheet,
  splitSelectorList,
} from "../css.ts";
import { deckPaths } from "../deck-paths.ts";
import { type Diagnostic, diag } from "../diagnostic.ts";
import { assetRefDiagnostics } from "./asset-refs.ts";
import type { LintContext } from "./context.ts";
import { isRawThemeValue, REQUIRED_TOKENS, tokenSuggestion } from "./tokens.ts";

/**
 * DEK018: no theme.css beside script.md. The deck would show unstyled, and
 * every theme rule (DEK010, DEK012 to DEK015) is silent until one exists.
 */
function missingThemeDiagnostic(ctx: LintContext): Diagnostic {
  return diag("DEK018", {
    message: "theme.css not found",
    path: deckPaths(ctx.deck.dir).theme,
    hint: "copy theme.css from the project root or another deck into the deck directory",
  });
}

/** DEK012, DEK013, DEK015, DEK014, and what its `url()`s load (DEK020 to DEK023) for theme.css. */
function lintTheme(
  { path, sheet, classes, tokens }: NonNullable<LintContext["theme"]>,
  { maxClasses, deckDir }: { maxClasses: number; deckDir: string },
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  // A rule inside `@media` reaches the page as surely as one outside it.
  for (const selector of outermostSelectors(sheet)) {
    if (isScopedThemeSelector(selector)) {
      continue;
    }
    diagnostics.push(
      diag("DEK012", {
        message: `theme selector "${selector}" must be scoped under .slide`,
        path,
        data: { selector },
      }),
    );
  }

  const classCount = classes.size;
  if (classCount > maxClasses) {
    diagnostics.push(
      diag("DEK013", {
        message: `theme.css has ${classCount} classes; limit is ${maxClasses}`,
        path,
        data: { classes: classCount, limit: maxClasses },
      }),
    );
  }

  for (const name of REQUIRED_TOKENS) {
    if (tokens.some((token) => token.name === name)) {
      continue;
    }
    diagnostics.push(
      diag("DEK015", {
        message: `theme.css is missing required token "${name}"`,
        path,
        data: { token: name },
      }),
    );
  }

  // The theme is in the deck like its slides: what it loads stays inside it, or the build links out.
  for (const url of cssUrls(sheet)) {
    diagnostics.push(
      ...assetRefDiagnostics(
        { value: url.value, use: "resource" },
        { path, line: url.line, deckDir },
      ),
    );
  }

  // Only a published token applies wherever the raw value sits.
  diagnostics.push(...rawValueDiagnostics(sheet, path, tokens));
  return diagnostics;
}

/** A slide's own stylesheet: tokens only, and nothing that reaches past the slide. */
export function lintSlideStyle(
  slug: string,
  path: string,
  sheet: Stylesheet,
  tokens: CssToken[],
  deckDir: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const selector of cssStyleSelectors(sheet)) {
    const parts = splitSelectorList(selector).map((part) => part.trim());
    const message = parts.some((part) => part.startsWith("::view-transition"))
      ? `"${selector}" applies to every slide; view transitions belong in theme.css`
      : parts.some((part) => PAGE_SELECTOR_RE.test(part))
        ? `"${selector}" never matches inside a slide; page-wide rules belong in theme.css`
        : undefined;
    if (message) {
      diagnostics.push(diag("DEK012", { message, path, slug, data: { selector } }));
    }
  }
  for (const name of cssAtRuleNames(sheet)) {
    if (name === "font-face" || name === "import") {
      diagnostics.push(
        diag("DEK012", {
          message: `@${name} applies to the whole deck; it belongs in theme.css`,
          path,
          slug,
          data: { atRule: name },
        }),
      );
    }
  }
  for (const url of cssUrls(sheet)) {
    diagnostics.push(
      ...assetRefDiagnostics(
        { value: url.value, use: "resource" },
        { path, line: url.line, slug, deckDir },
      ),
    );
  }
  diagnostics.push(
    ...rawValueDiagnostics(sheet, path, [...tokens, ...publishedTokens(sheet)], slug),
  );
  return diagnostics;
}

/** DEK014 for theme.css and slide stylesheets alike: design values come from tokens. */
function rawValueDiagnostics(
  sheet: Stylesheet,
  path: string,
  tokens: CssToken[],
  slug?: string,
): Diagnostic[] {
  return sheet.decls
    .filter((decl) => isRawThemeValue(decl.property, decl.value))
    .map((decl) =>
      diag("DEK014", {
        message: `raw value in "${decl.property}: ${decl.value}"; use a theme token`,
        path,
        line: decl.line,
        hint: rawValueHint(tokenSuggestion(decl.property, decl.value, tokens), decl.value, slug),
        data: { property: decl.property, value: decl.value },
        ...(slug === undefined ? {} : { slug }),
      }),
    );
}

/**
 * DEK014's hint. theme.css gains a token; a slide stylesheet may name the value on its own
 * `.slide` instead, since a value one slide uses need not join the theme.
 */
function rawValueHint(suggestion: string | undefined, value: string, slug?: string): string {
  if (slug === undefined) {
    return suggestion ?? "add a token for it to .slide and use var() here";
  }
  const local = `name it in this file: .slide { --<name>: ${value}; }`;
  return suggestion ? `${suggestion}; or ${local}` : `${local}, then use var(--<name>)`;
}

/** Selectors that name the page, which a scoped slide rule can never reach. */
const PAGE_SELECTOR_RE = /^(:root|html|body)(?=$|[\s[.:#>+~])/;

/** The theme's own findings, or DEK018 when there is no theme. */
export function themeDiagnostics(ctx: LintContext): Diagnostic[] {
  return ctx.theme
    ? lintTheme(ctx.theme, { maxClasses: ctx.config.maxClasses, deckDir: ctx.deck.dir })
    : [missingThemeDiagnostic(ctx)];
}
