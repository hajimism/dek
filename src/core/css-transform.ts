import { outermostStyleRules, type Stylesheet, splitSelectorList, startsAtSlide } from "./css.ts";
import { consumeComment, consumeToken, cssIdents } from "./css-scan.ts";

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
const CSS_NEWLINES = new Set(["\n", "\r", "\f"]);

/** A token that runs on into the next with nothing between: a name, a number, or `#@.+/`. */
const RUNS_ON_RE = /^[-\w\u0080-\uffff\0\\#@.+/]/;
/** What such a token runs on into: a name, a number, `(`, `%`, or the `*` that opens a comment. */
const RUNS_INTO_RE = /^[-\w\u0080-\uffff\0\\.+(%*]/;

/**
 * Whether the token `last` and the one that starts with `next` would read as one with nothing
 * between them: `x` and `url(` as `xurl(`, `/` and `*` as a comment, or `--` and `>`, `<` and
 * `!`, `!` and `--` as the `-->` and `<!--` a stylesheet skips.
 */
function runTogether(last: string, next: string): boolean {
  return (
    (RUNS_ON_RE.test(last) && RUNS_INTO_RE.test(next)) ||
    (last.endsWith("--") && next === ">") ||
    (last === "<" && next === "!") ||
    (last === "!" && next === "-")
  );
}

/** A hex escape at the end of a token, which takes one whitespace after it as its own. */
const HEX_ESCAPE_END_RE = /\\[0-9a-fA-F]{1,6}$/;

/**
 * Drops comments and collapses whitespace to one space, leaving strings and `url()`s byte for
 * byte, so `content: "a　b"` or `"  "` renders in the build as it does on the dev server. The
 * result reads as the source does: a newline after a string stays one, since it is what ends a
 * string cut short, and a comment between two tokens that would run into one, as `x` and `url(`
 * into `xurl(`, stays as an empty one, since a space would make `div` and `p` two selectors. A
 * hex escape that a comment ends, such as `\41` before a comment and ` x`, is followed by two
 * spaces, since it takes one as its own.
 */
export function minifyCss(css: string): string {
  let out = "";
  let last = "";
  // What parts the last token written from the next: "", "comment", a space, or the newline that
  // ends a string.
  let gap = "";
  let i = 0;
  while (i < css.length) {
    const ch = css[i] ?? "";
    if (ch === "/" && css[i + 1] === "*") {
      i = consumeComment(css, i);
      gap ||= "comment";
      continue;
    }
    if (CSS_WHITESPACE.has(ch)) {
      const whitespace = ch === "\r" && css[i + 1] === "\n" ? "\r\n" : ch;
      if (gap === "" && CSS_NEWLINES.has(ch) && (last[0] === '"' || last[0] === "'")) {
        // One LF, unless the string ends on a CR it escapes, which an LF would join into a CRLF.
        gap = last.endsWith("\r") ? whitespace : "\n";
      } else if (gap === "" || gap === "comment") {
        gap = " ";
      }
      i += whitespace.length;
      continue;
    }
    if (out !== "") {
      out +=
        gap === "comment"
          ? runTogether(last, ch)
            ? "/**/"
            : ""
          : gap === " " && HEX_ESCAPE_END_RE.test(last)
            ? "  "
            : gap;
    }
    gap = "";
    const end = consumeToken(css, i);
    last = css.slice(i, end);
    out += last;
    i = end;
  }
  return out;
}
