import { bundledTokenValue } from "../bundled-theme.ts";
import {
  type CssToken,
  cssAtRules,
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
import { isRawThemeValue, isRawTokenValue, REQUIRED_TOKENS, tokenSuggestion } from "./tokens.ts";

/**
 * DEKC018: no theme.css beside script.md. The deck would show unstyled, and
 * every theme rule (DEKC010, DEKC012 to DEKC015) is silent until one exists.
 */
function missingThemeDiagnostic(ctx: LintContext): Diagnostic {
  return diag("DEKC018", {
    message: "theme.css not found",
    path: deckPaths(ctx.deck.dir).theme,
    hint: "copy theme.css from the project root or another deck into the deck directory",
  });
}

/** DEKC012, DEKC013, DEKC015, DEKC014, and what its `url()`s load (DEKC020 to DEKC023) for theme.css. */
function lintTheme(
  { path, sheet, classes, tokens }: NonNullable<LintContext["theme"]>,
  { maxClasses, deckDir }: { maxClasses: number; deckDir: string },
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  // A rule inside `@media` reaches the page as surely as one outside it.
  for (const { selector, line } of outermostSelectors(sheet)) {
    if (isScopedThemeSelector(selector)) {
      continue;
    }
    diagnostics.push(
      diag("DEKC012", {
        message: `theme selector "${selector}" must be scoped under .slide`,
        path,
        line,
        hint: themeScopeHint(selector),
        data: { selector },
      }),
    );
  }

  const classCount = classes.size;
  if (classCount > maxClasses) {
    diagnostics.push(
      diag("DEKC013", {
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
      diag("DEKC015", {
        message: `theme.css is missing required token "${name}"`,
        path,
        hint: missingTokenHint(name),
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
  const reach = (
    message: string,
    line: number,
    hint: string,
    data: Record<string, string>,
  ): void => {
    diagnostics.push(diag("DEKC012", { message, path, line, slug, hint, data }));
  };
  for (const { selector, line } of cssStyleSelectors(sheet)) {
    const parts = splitSelectorList(selector).map((part) => part.trim());
    if (parts.some((part) => part.startsWith("::view-transition"))) {
      reach(
        `"${selector}" applies to every slide`,
        line,
        "move it to theme.css, where view transitions belong",
        { selector },
      );
    } else if (parts.some((part) => PAGE_SELECTOR_RE.test(part))) {
      reach(
        `"${selector}" never matches inside a slide`,
        line,
        "move it to theme.css, or start it at .slide",
        { selector },
      );
    } else if (parts.some((part) => SIBLING_OF_SLIDE_RE.test(part))) {
      reach(
        `"${selector}" reaches the slides after this one`,
        line,
        "start the selector at .slide and stay inside it; a rule for more than one slide belongs in theme.css",
        { selector },
      );
    }
  }
  for (const { name, line } of cssAtRules(sheet)) {
    if (DECK_AT_RULES.has(name.toLowerCase())) {
      reach(`@${name} applies to the whole deck`, line, "move it to theme.css", { atRule: name });
    }
  }
  // In the order the file writes them, selectors and at-rules alike.
  diagnostics.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
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

/**
 * Whether a rule is where tokens are set: on the slide itself, as `.slide` or a compound of it such
 * as `.slide[data-layout="split"]`, or on a view transition, which the theme draws. A custom
 * property set anywhere else is a raw value handed to whatever reads it.
 */
function setsTokens(selector: string): boolean {
  return splitSelectorList(selector).every((part) => {
    const item = part.trim();
    return item.startsWith("::view-transition") || /^\.slide(?![-\w])[^\s>+~]*$/.test(item);
  });
}

/** DEKC014 for theme.css and slide stylesheets alike: design values come from tokens. */
function rawValueDiagnostics(
  sheet: Stylesheet,
  path: string,
  tokens: CssToken[],
  slug?: string,
): Diagnostic[] {
  return sheet.decls
    .filter((decl) =>
      decl.property.startsWith("--")
        ? !setsTokens(decl.selector) && isRawTokenValue(decl.value)
        : isRawThemeValue(decl.property, decl.value),
    )
    .map((decl) => {
      // A part that changes a token the theme or the sheet's own .slide sets keeps its change
      // through a name of its own; moving the value to .slide would change the whole slide.
      const changes =
        decl.property.startsWith("--") &&
        (tokens.some((token) => token.name === decl.property) ||
          sheet.decls.some(
            (other) => other.property === decl.property && setsTokens(other.selector),
          ));
      const token = changes ? `${decl.property}-${partName(decl.selector)}` : undefined;
      return diag("DEKC014", {
        message: `raw value in "${decl.property}: ${decl.value}"; use a theme token`,
        path,
        line: decl.line,
        hint: token
          ? partTokenHint(decl, token, slug)
          : decl.property.startsWith("--")
            ? tokenPlaceHint(decl.property, slug)
            : rawValueHint(tokenSuggestion(decl.property, decl.value, tokens), decl.value, slug),
        data: { property: decl.property, value: decl.value, ...(token ? { token } : {}) },
        ...(slug === undefined ? {} : { slug }),
      });
    });
}

/**
 * What a rule is called by: the last class or id of its first selector's last compound, else its
 * tag, so `.slide .card > .title` is "title" and `.slide li` is "li".
 */
function partName(selector: string): string {
  const last =
    (selector.split(",")[0] ?? "")
      .trim()
      .split(/\s*[\s>+~]\s*/)
      .at(-1) ?? "";
  const named = [...last.matchAll(/[.#]([\w-]+)/g)].at(-1)?.[1];
  return named ?? last.match(/^[a-z][\w-]*/i)?.[0] ?? "part";
}

/** A token a part changes: the value named on .slide, and the part pointing its token at it. */
function partTokenHint(
  decl: { property: string; value: string; selector: string },
  token: string,
  slug?: string,
): string {
  const where = slug === undefined ? "the .slide rule in theme.css" : "this file's .slide rule";
  return `name the value on ${where}, as ${token}: ${decl.value}, and set ${decl.property}: var(${token}) here, so ${decl.selector} still changes ${decl.property} for what it holds`;
}

/**
 * DEKC014's hint. theme.css gains a token; a slide stylesheet may name the value on its own
 * `.slide` instead, since a value one slide uses need not join the theme.
 */
/** The line to add, with the value dekc's own theme gives the token. */
function missingTokenHint(name: string): string {
  const value = bundledTokenValue(name);
  return value === undefined
    ? `add ${name} to the .slide rule in theme.css`
    : `add ${name}: ${value}; to the .slide rule in theme.css, as dekc's own theme sets it`;
}

/** A raw custom property set off the slide belongs on it, where a token is set and published. */
function tokenPlaceHint(property: string, slug?: string): string {
  return slug === undefined
    ? `set ${property} on the .slide rule, where the theme's tokens go, and use var(${property}) below it`
    : `set ${property} on this file's .slide rule, where the slide's own tokens go, and use var(${property}) below it`;
}

function rawValueHint(suggestion: string | undefined, value: string, slug?: string): string {
  if (slug === undefined) {
    return suggestion ?? "add a token for it to .slide and use var() here";
  }
  const local = `name it in this file: .slide { --<name>: ${value}; }`;
  return suggestion ? `${suggestion}; or ${local}` : `${local}, then use var(--<name>)`;
}

/** Selectors that name the page, which a scoped slide rule can never reach. */
const PAGE_SELECTOR_RE = /^(:root|html|body)(?=$|[\s[.:#>+~])/;

/**
 * A slide rule that steps from the slide to a sibling: scoped, `.slide ~ .slide` still matches
 * every slide after this one.
 */
const SIBLING_OF_SLIDE_RE = /^\.slide(?![-\w])[^\s>+~]*\s*[+~]/;

/**
 * At-rules that register something for the whole document, which no slide scope can confine: a
 * font, an import, a custom property's type, a counter style, the printed page.
 */
const DECK_AT_RULES = new Set([
  "font-face",
  "import",
  "property",
  "counter-style",
  "page",
  "font-palette-values",
  "font-feature-values",
]);

/** How to write an unscoped theme selector so it styles slides. */
function themeScopeHint(selector: string): string {
  const parts = splitSelectorList(selector).map((part) => part.trim());
  if (parts.some((part) => PAGE_SELECTOR_RE.test(part))) {
    return "theme.css styles slides, not the page: put it on .slide, whose content inherits it";
  }
  const scoped = parts.map((part) => (isScopedThemeSelector(part) ? part : `.slide ${part}`));
  return `write it as ${scoped.join(", ")}`;
}

/** The theme's own findings, or DEKC018 when there is no theme. */
export function themeDiagnostics(ctx: LintContext): Diagnostic[] {
  return ctx.theme
    ? lintTheme(ctx.theme, { maxClasses: ctx.config.maxClasses, deckDir: ctx.deck.dir })
    : [missingThemeDiagnostic(ctx)];
}
