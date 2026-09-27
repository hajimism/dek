import {
  blankStringsAndComments,
  consumeComment,
  consumeString,
  matchBrace,
  scanTopLevel,
  splitTopLevel,
  stripComments,
} from "./css-scan.ts";
import { lineLocator } from "./lines.ts";

export type CssDeclaration = {
  /**
   * The rule's selector, with nesting resolved: `.slide { &:hover {} }` gives `.slide:hover`.
   * A descriptor outside every style rule, such as `@font-face`'s, has none: "".
   */
  selector: string;
  property: string;
  value: string;
  line: number;
  /** Where the value is written in the stylesheet: `[valueStart, valueEnd)`, spaces trimmed. */
  valueStart: number;
  valueEnd: number;
  /** The at-rules around the declaration, outermost first, such as `@media (…)`. */
  atPath: string[];
};

type RuleBase = {
  /** The selector or the at-rule's prelude as written, comments dropped: `&:hover`, `@media (…)`. */
  prelude: string;
  /** Where the prelude is written, spaces trimmed. */
  preludeStart: number;
  preludeEnd: number;
  /** The block's inside; `bodyEnd` is its closing `}`, or the end of an unclosed one. */
  bodyStart: number;
  bodyEnd: number;
  /** The at-rules around the rule, outermost first. */
  atPath: string[];
  /** The style rule this one is nested in. */
  parent?: StyleRule;
  /** A keyframe stop, or an at-rule inside `@keyframes`. */
  keyframe: boolean;
  /** The declarations written directly in the block, not in blocks nested in it. */
  decls: CssDeclaration[];
};

export type StyleRule = RuleBase & {
  kind: "style";
  /** The selector with nesting resolved; a keyframe stop's is its prelude. */
  selector: string;
};

/**
 * An at-rule with a block. One nested in a style rule, such as `.card { @media (…) { … } }`,
 * styles that rule's elements: its `parent` names them.
 */
export type AtRule = RuleBase & {
  kind: "at";
  /** A block of descriptors, such as `@font-face`, instead of rules or declarations. */
  descriptors: boolean;
};

export type CssRule = StyleRule | AtRule;

/** One `url()`, the address it names and the span of the whole token. */
export type CssUrl = { value: string; line: number; start: number; end: number };

/** A stylesheet read once; every question css.ts answers is a look at this. */
export type Stylesheet = {
  source: string;
  /** Every rule at any depth, style and at-rules alike, in source order. */
  rules: CssRule[];
  /** The declarations of style rules and keyframe stops, nested ones included, in source order. */
  decls: CssDeclaration[];
  /** The descriptors of `@font-face` and its kind. */
  descriptors: CssDeclaration[];
  /** Every at-rule, block or statement, by name without the `@`. */
  atRules: Array<{ name: string; start: number }>;
  /** Every `url()` in a declaration or descriptor value; one inside a string is text. */
  urls: CssUrl[];
  /** Where each `@keyframes` name is written. */
  keyframes: Array<{ name: string; start: number; end: number }>;
};

const KEYFRAMES_RE = /^@(-\w+-)?keyframes\b/i;
/** At-rules whose block holds descriptors, written like declarations, instead of rules. */
const DESCRIPTOR_AT_RULE_RE = /^@(font-face|page|property|counter-style|font-palette-values)\b/i;
const WHITESPACE_RE = /\s/;

type Scope = {
  atPath: string[];
  parent?: StyleRule;
  /** The rule whose block this is, which the block's declarations belong to. */
  owner?: CssRule;
  keyframe: boolean;
  /** What the block holds: rules (a sheet, `@media` at the top), declarations, or descriptors. */
  holds: "rules" | "decls" | "descriptors";
};

/** Reads a stylesheet once: rules with their nesting, declarations, at-rules, and `url()`s. */
export function parseCss(source: string): Stylesheet {
  const sheet: Stylesheet = {
    source,
    rules: [],
    decls: [],
    descriptors: [],
    atRules: [],
    urls: [],
    keyframes: [],
  };
  const reader = new SheetReader(sheet);
  reader.block(0, source.length, { atPath: [], keyframe: false, holds: "rules" });
  return sheet;
}

class SheetReader {
  readonly source: string;
  readonly blank: string;
  readonly lineOf: (offset: number) => number;
  /** Where each comment is written, in order. */
  readonly comments: Array<[number, number]> = [];

  constructor(readonly sheet: Stylesheet) {
    this.source = sheet.source;
    this.blank = blankStringsAndComments(sheet.source);
    const { source } = this;
    let i = 0;
    while (i < source.length) {
      const ch = source[i];
      if (ch === '"' || ch === "'") {
        i = consumeString(source, i);
      } else if (ch === "/" && source[i + 1] === "*") {
        const close = consumeComment(source, i);
        this.comments.push([i, close]);
        i = close;
      } else {
        i += ch === "\\" ? 2 : 1;
      }
    }
    const locate = lineLocator(sheet.source);
    this.lineOf = (offset) => locate(offset).line;
  }

  block(start: number, end: number, scope: Scope): void {
    const { source } = this;
    let i = start;
    while (i < end) {
      i = this.skipSpace(i, end);
      const ch = source[i];
      if (i >= end) {
        break;
      }
      if (ch === "}" || ch === ";") {
        i++;
      } else if (ch === "@") {
        i = this.atRule(i, end, scope);
      } else if (scope.holds === "rules") {
        i = this.styleRule(i, scanTopLevel(source, i, end, "{}"), end, scope);
      } else {
        i = this.declarationOrRule(i, end, scope);
      }
    }
  }

  skipSpace(from: number, end: number): number {
    let i = from;
    while (i < end) {
      if (WHITESPACE_RE.test(this.source[i] ?? "")) {
        i++;
      } else if (this.source[i] === "/" && this.source[i + 1] === "*") {
        i = consumeComment(this.source, i, end);
      } else {
        break;
      }
    }
    return i;
  }

  /** A prelude's span with its trailing spaces trimmed off. */
  trimEnd(start: number, end: number): number {
    let j = end;
    while (j > start && WHITESPACE_RE.test(this.blank[j - 1] ?? "")) {
      j--;
    }
    return j;
  }

  atRule(start: number, end: number, scope: Scope): number {
    const { source, sheet } = this;
    const name = /^@([-a-zA-Z]+)/.exec(source.slice(start, start + 64))?.[1];
    if (name) {
      sheet.atRules.push({ name, start });
    }
    const stop = scanTopLevel(source, start, end, ";{}");
    if (source[stop] !== "{") {
      return source[stop] === ";" ? stop + 1 : stop;
    }
    const close = matchBrace(source, stop, end);
    const preludeEnd = this.trimEnd(start, stop);
    const prelude = stripComments(source.slice(start, preludeEnd)).trim();
    const descriptors = DESCRIPTOR_AT_RULE_RE.test(prelude);
    const keyframes = KEYFRAMES_RE.test(prelude);
    const rule: AtRule = {
      kind: "at",
      prelude,
      preludeStart: start,
      preludeEnd,
      bodyStart: stop + 1,
      bodyEnd: close,
      atPath: scope.atPath,
      ...(scope.parent ? { parent: scope.parent } : {}),
      descriptors,
      keyframe: scope.keyframe,
      decls: [],
    };
    sheet.rules.push(rule);
    if (keyframes) {
      this.keyframesName(start + (name?.length ?? 0) + 1, stop);
    }
    this.block(stop + 1, close, {
      atPath: [...scope.atPath, prelude],
      ...(scope.parent ? { parent: scope.parent } : {}),
      owner: rule,
      keyframe: scope.keyframe || keyframes,
      holds: descriptors ? "descriptors" : keyframes || scope.holds === "rules" ? "rules" : "decls",
    });
    return close + 1;
  }

  keyframesName(from: number, end: number): void {
    const at = this.skipSpace(from, end);
    const quote = this.source[at];
    if (quote === '"' || quote === "'") {
      const close = consumeString(this.source, at, end);
      this.sheet.keyframes.push({
        name: this.source.slice(at + 1, close - 1),
        start: at + 1,
        end: close - 1,
      });
      return;
    }
    const ident = /^[-_a-zA-Z][-\w]*/.exec(this.source.slice(at, end));
    if (ident) {
      this.sheet.keyframes.push({ name: ident[0], start: at, end: at + ident[0].length });
    }
  }

  /** A style rule whose prelude runs from `start` to the `{` at `open`. */
  styleRule(start: number, open: number, end: number, scope: Scope): number {
    const { source } = this;
    if (source[open] !== "{") {
      return open;
    }
    const close = matchBrace(source, open, end);
    const preludeEnd = this.trimEnd(start, open);
    const prelude = stripComments(source.slice(start, preludeEnd)).trim();
    const rule: StyleRule = {
      kind: "style",
      prelude,
      preludeStart: start,
      preludeEnd,
      bodyStart: open + 1,
      bodyEnd: close,
      selector: scope.keyframe ? prelude : resolveNesting(prelude, scope.parent?.selector),
      atPath: scope.atPath,
      ...(scope.parent ? { parent: scope.parent } : {}),
      keyframe: scope.keyframe,
      decls: [],
    };
    this.sheet.rules.push(rule);
    this.block(open + 1, close, {
      atPath: scope.atPath,
      parent: rule,
      owner: rule,
      keyframe: scope.keyframe,
      holds: "decls",
    });
    return close + 1;
  }

  /**
   * In a block of declarations, `color: red` is a declaration and `&:hover { … }` a nested rule:
   * a `{` outside parentheses makes it a rule, unless it sits in a custom property's value.
   */
  declarationOrRule(start: number, end: number, scope: Scope): number {
    const { source } = this;
    const colon = scanTopLevel(source, start, end, ":;{}");
    if (source[colon] === "{") {
      return scope.holds === "decls"
        ? this.styleRule(start, colon, end, scope)
        : matchBrace(source, colon, end) + 1;
    }
    if (source[colon] !== ":") {
      return source[colon] === ";" ? colon + 1 : colon;
    }
    const property = stripComments(source.slice(start, colon)).trim();
    let stop = scanTopLevel(source, colon + 1, end, ";{}");
    while (source[stop] === "{") {
      if (!property.startsWith("--")) {
        return scope.holds === "decls"
          ? this.styleRule(start, stop, end, scope)
          : matchBrace(source, stop, end) + 1;
      }
      stop = scanTopLevel(source, matchBrace(source, stop, end) + 1, end, ";{}");
    }
    const valueStart = this.skipSpace(colon + 1, stop);
    const valueEnd = Math.max(valueStart, this.trimEnd(colon + 1, stop));
    if (property && scope.owner) {
      const decl: CssDeclaration = {
        selector: ruleSelector(scope.owner),
        property,
        value: this.valueText(colon + 1, stop),
        line: this.lineOf(start),
        valueStart,
        valueEnd,
        atPath: scope.atPath,
      };
      scope.owner.decls.push(decl);
      (scope.holds === "descriptors" ? this.sheet.descriptors : this.sheet.decls).push(decl);
      this.urls(valueStart, valueEnd);
    }
    return source[stop] === ";" ? stop + 1 : stop;
  }

  /** A value as the browser reads it: each comment a space, strings as written. */
  valueText(start: number, end: number): string {
    let out = "";
    let from = start;
    for (const [open, close] of this.comments) {
      if (open >= start && open < end) {
        out += `${this.source.slice(from, open)} `;
        from = Math.min(close, end);
      }
    }
    return (out + this.source.slice(from, end)).trim();
  }

  urls(start: number, end: number): void {
    const syntax = this.blank.slice(start, end);
    for (const match of syntax.matchAll(/(?<![-\w])url\(/gi)) {
      const at = start + match.index;
      // The address itself may be quoted, so it is read from the source, not the blanked copy.
      const token = /^url\(\s*(["']?)([^"')]*)\1\s*\)/i.exec(this.source.slice(at, end));
      if (token) {
        this.sheet.urls.push({
          value: (token[2] ?? "").trim(),
          line: this.lineOf(at),
          start: at,
          end: at + token[0].length,
        });
      }
    }
  }
}

/** The elements a rule's declarations style: an at-rule styles its parent's, if any. */
function ruleSelector(rule: CssRule): string {
  return rule.kind === "style" ? rule.selector : (rule.parent?.selector ?? "");
}

/**
 * A nested selector read against its parent's, as CSS nesting reads it: `&` stands for the
 * parent, and a part without one is a descendant of it.
 */
function resolveNesting(selector: string, parent: string | undefined): string {
  if (parent === undefined) {
    return selector;
  }
  const parents = splitSelectorList(parent)
    .map((part) => part.trim())
    .filter(Boolean);
  const self = parents.length === 1 ? (parents[0] ?? "") : `:is(${parents.join(", ")})`;
  return splitSelectorList(selector)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.includes("&") ? part.replaceAll("&", self) : `${self} ${part}`))
    .join(", ");
}

/** Style rules, nested ones included, that are not keyframe stops. */
function styleRules(sheet: Stylesheet): StyleRule[] {
  return sheet.rules.filter((rule): rule is StyleRule => rule.kind === "style" && !rule.keyframe);
}

/**
 * The style rules nested in no other style rule, those inside `@media` or `@supports`
 * included, and not keyframe stops: the rules whose selectors reach the page as written.
 */
export function outermostStyleRules(sheet: Stylesheet): StyleRule[] {
  return styleRules(sheet).filter((rule) => !rule.parent);
}

const CLASS_RE = /\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/g;
const LAYOUT_ATTR_RE = /\[data-layout\s*=\s*(["']?)([^\]"'\s]+)\1\]/g;

/** The classes a selector names; a dot inside a string or an attribute value is no class. */
export function selectorClasses(selector: string): string[] {
  return [...blankStringsAndComments(selector).matchAll(CLASS_RE)].flatMap((match) =>
    match[1] ? [match[1]] : [],
  );
}

/** The layouts a selector names through `[data-layout=...]`. */
export function selectorLayouts(selector: string): string[] {
  return [...selector.matchAll(LAYOUT_ATTR_RE)].flatMap((match) => (match[2] ? [match[2]] : []));
}

export function cssClassNames(sheet: Stylesheet): Set<string> {
  return new Set(styleRules(sheet).flatMap((rule) => selectorClasses(rule.prelude)));
}

/** The layouts the stylesheet's selectors name through `[data-layout=...]`. */
export function cssLayoutNames(sheet: Stylesheet): Set<string> {
  return new Set(styleRules(sheet).flatMap((rule) => selectorLayouts(rule.prelude)));
}

/** Style rule selectors at any depth, nesting resolved, skipping keyframe stops. */
export function cssStyleSelectors(sheet: Stylesheet): string[] {
  return styleRules(sheet).map((rule) => rule.selector);
}

/** Every at-rule name in the stylesheet, such as `font-face` or `media`, in source order; strings are skipped. */
export function cssAtRuleNames(sheet: Stylesheet): string[] {
  return sheet.atRules.map((at) => at.name);
}

/**
 * Each `url()` a declaration or an `@font-face`-like descriptor references, with its line; a
 * `url(` inside a string is text.
 */
export function cssUrls(sheet: Stylesheet): Array<{ value: string; line: number }> {
  return sheet.urls.map(({ value, line }) => ({ value, line }));
}

/**
 * The selectors that reach the page on their own: every outermost style rule, but not those
 * under `@scope`, which names its own root.
 */
export function outermostSelectors(sheet: Stylesheet): string[] {
  return outermostStyleRules(sheet)
    .filter((rule) => !rule.atPath.some((at) => /^@scope\b/i.test(at)))
    .map((rule) => rule.prelude);
}

/** Whether each part of a selector list starts at `.slide`, or is a view-transition pseudo-element. */
export function isScopedThemeSelector(selector: string): boolean {
  return splitSelectorList(selector).every((part) => {
    const item = part.trim();
    return item === "" || item.startsWith("::view-transition-") || startsAtSlide(item);
  });
}

/** Splits `a, b` on top-level commas only, leaving `:is(.a, .b)` whole. */
export function splitSelectorList(selector: string): string[] {
  return splitTopLevel(selector, ",");
}

/** A selector part that starts at the slide itself, not at a class that merely begins with "slide". */
export function startsAtSlide(part: string): boolean {
  return /^\.slide(?=$|[\s[.:#>+~])/.test(part);
}

/** Whether an at-rule prelude opens `@keyframes`, vendor-prefixed or not. */
export function isKeyframesPrelude(prelude: string): boolean {
  return KEYFRAMES_RE.test(prelude);
}

/** A `--*` token and the value assigned to it. */
export type CssToken = { name: string; value: string };

/**
 * The tokens every slide can `var()`: the ones the bare `.slide` rule sets outside any at-rule,
 * first assignment of each name, in order. One set only on a layout, inside one element, under
 * `@media`, or on a view transition is no token a slide can count on.
 */
export function publishedTokens(sheet: Stylesheet): CssToken[] {
  return firstAssignments(
    sheet.decls.filter(
      (decl) =>
        decl.selector === ".slide" && decl.atPath.length === 0 && decl.property.startsWith("--"),
    ),
  );
}

function firstAssignments(decls: CssDeclaration[]): CssToken[] {
  const seen = new Set<string>();
  return decls.flatMap((decl) => {
    if (seen.has(decl.property)) {
      return [];
    }
    seen.add(decl.property);
    return [{ name: decl.property, value: decl.value }];
  });
}
