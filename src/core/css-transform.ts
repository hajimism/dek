import { outermostStyleRules, type Stylesheet, splitSelectorList, startsAtSlide } from "./css.ts";
import { consumeComment, consumeString, cssIdents } from "./css-scan.ts";

/** Text to put in place of `[start, end)` of the stylesheet as it was read. */
type CssEdit = { start: number; end: number; text: string };

/** One rewrite, as the edits it makes to a stylesheet. */
export type CssEditor = (sheet: Stylesheet) => CssEdit[];

/**
 * The stylesheet with every editor's edits applied at once. Each editor reads the same sheet, so
 * a pipeline of rewrites parses the stylesheet once; their edits must not overlap.
 */
export function rewriteCss(sheet: Stylesheet, ...editors: CssEditor[]): string {
  const edits = editors.flatMap((editor) => editor(sheet)).sort((a, b) => a.start - b.start);
  let out = "";
  let from = 0;
  for (const edit of edits) {
    out += sheet.source.slice(from, edit.start) + edit.text;
    from = edit.end;
  }
  return out + sheet.source.slice(from);
}

/**
 * Scopes a slide's own stylesheet to that slide. A leading `.slide` compound
 * gains `:where([data-slug])`; any other selector is nested under the scoped
 * slide. The scope weighs exactly one `.slide`, so a rule behaves as if it were
 * written at the end of theme.css: it beats the theme's `.slide .x`, and the
 * theme's state rules (`.slide.is-current [data-step]`) still beat it.
 * Local keyframes are renamed so two slides can both define `pop`.
 */
export function scopeToSlide(slug: string): CssEditor {
  const scope = `.slide:where([data-slug="${slug}"])`;
  const rename = (name: string) => `${slug}--${name}`;
  return (sheet) => {
    const edits: CssEdit[] = outermostStyleRules(sheet).map((rule) => ({
      start: rule.preludeStart,
      end: rule.preludeEnd,
      text: splitSelectorList(rule.prelude)
        .map((part) => {
          const item = part.trim();
          return startsAtSlide(item)
            ? `${scope}${item.slice(".slide".length)}`
            : `${scope} ${item}`;
        })
        .join(", "),
    }));
    const local = new Set(sheet.keyframes.map((keyframes) => keyframes.name));
    for (const keyframes of sheet.keyframes) {
      edits.push({ start: keyframes.start, end: keyframes.end, text: rename(keyframes.name) });
    }
    for (const decl of sheet.decls) {
      if (local.size === 0 || !ANIMATION_PROPERTY_RE.test(decl.property)) {
        continue;
      }
      for (const { ident, start } of cssIdents(
        sheet.source.slice(decl.valueStart, decl.valueEnd),
      )) {
        if (local.has(ident)) {
          const at = decl.valueStart + start;
          edits.push({ start: at, end: at + ident.length, text: rename(ident) });
        }
      }
    }
    return edits;
  };
}

const ANIMATION_PROPERTY_RE = /^(-\w+-)?animation(-name)?$/i;

/**
 * Gives the view-transition pseudo-elements the theme's tokens. They hang off the root, not
 * `.slide`, so `var(--step-transition)` in `::view-transition-new(slide)` would find nothing.
 * Each rule that sets tokens on every slide gains a twin on `::view-transition` holding those
 * tokens alone, inside the same at-rule, so the transition sees the values the slides see.
 */
export const shareTokensWithTransitions: CssEditor = (sheet) =>
  outermostStyleRules(sheet).flatMap((rule) => {
    if (!splitSelectorList(rule.prelude).some((part) => part.trim() === ".slide")) {
      return [];
    }
    const tokens = rule.decls
      // A `url()` token is an image the transition never draws; copying it would inline it twice.
      .filter(
        (decl) =>
          decl.property.startsWith("--") &&
          !sheet.urls.some((url) => url.start >= decl.valueStart && url.start < decl.valueEnd),
      )
      .map((decl) => `${decl.property}: ${decl.value};`);
    const at = rule.bodyEnd + 1;
    return tokens.length === 0
      ? []
      : [{ start: at, end: at, text: `\n::view-transition { ${tokens.join(" ")} }` }];
  });

/**
 * Each `url()` that `cssUrls` reports rewritten to `url("<replacement>")`, or left as written
 * when `replace` has none for it.
 */
export function replaceUrls(replace: (value: string) => string | undefined): CssEditor {
  return (sheet) =>
    sheet.urls.flatMap((url) => {
      const next = replace(url.value);
      return next === undefined ? [] : [{ start: url.start, end: url.end, text: `url("${next}")` }];
    });
}

/** Whitespace as CSS defines it. U+3000 and NBSP are content, not whitespace. */
const CSS_WHITESPACE = new Set([" ", "\t", "\n", "\r", "\f"]);

/**
 * Drops comments and collapses whitespace to one space, leaving strings byte for byte, so
 * `content: "a　b"` or `"  "` renders in the build as it does on the dev server.
 */
export function minifyCss(css: string): string {
  let out = "";
  let space = false;
  let i = 0;
  while (i < css.length) {
    const ch = css[i] ?? "";
    if (ch === "/" && css[i + 1] === "*") {
      i = consumeComment(css, i);
      continue;
    }
    if (CSS_WHITESPACE.has(ch)) {
      space = true;
      i++;
      continue;
    }
    if (space && out !== "") {
      out += " ";
    }
    space = false;
    const end = ch === '"' || ch === "'" ? consumeString(css, i) : ch === "\\" ? i + 2 : i + 1;
    out += css.slice(i, end);
    i = end;
  }
  return out;
}
