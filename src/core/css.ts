export type CssDeclaration = {
  selector: string;
  property: string;
  value: string;
  line: number;
  /** Where the value starts in the stylesheet, which comments do not shift. */
  valueStart: number;
};

type CssRule = {
  selector: string;
  selectorStart: number;
  atPath: string[];
  bodyStart: number;
  bodyEnd: number;
  depth: number;
};

const KEYFRAMES_RE = /^@(-\w+-)?keyframes\b/;

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
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
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 2;
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
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== ch && css[j] !== "\n") {
        j += css[j] === "\\" ? 2 : 1;
      }
      out += css.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === "\\") {
      out += css.slice(i, i + 2);
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function stripCssCommentsPreserveLines(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "));
}

export function cssCustomProperties(css: string): Set<string> {
  const names = new Set<string>();
  for (const decl of collectDeclarations(stripCssCommentsPreserveLines(css), false)) {
    if (decl.selector === ".slide" && decl.property.startsWith("--")) {
      names.add(decl.property);
    }
  }
  return names;
}

export function cssDeclarations(css: string): CssDeclaration[] {
  return collectDeclarations(stripCssCommentsPreserveLines(css), true);
}

export function cssClassNames(css: string): Set<string> {
  const names = new Set<string>();
  for (const selector of cssSelectors(css)) {
    for (const match of selector.matchAll(/\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/g)) {
      if (match[1]) {
        names.add(match[1]);
      }
    }
  }
  return names;
}

function cssSelectors(css: string): string[] {
  return [...walkRules(stripCssComments(css))].map((rule) => rule.selector);
}

/** Style rule selectors at any depth, skipping keyframe stops. */
export function cssStyleSelectors(css: string): string[] {
  return [...walkRules(stripCssComments(css))]
    .filter((rule) => !rule.atPath.some((at) => KEYFRAMES_RE.test(at)))
    .map((rule) => rule.selector);
}

/** Every at-rule name in the stylesheet, such as `font-face` or `media`, in source order; strings are skipped. */
export function cssAtRuleNames(css: string): string[] {
  const source = stripCssComments(css);
  const names: string[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      i = consumeString(source, i);
      continue;
    }
    if (ch === "@") {
      const match = /^[-a-zA-Z]+/.exec(source.slice(i + 1));
      if (match) {
        names.push(match[0]);
        i += match[0].length;
      }
    }
    i++;
  }
  return names;
}

/**
 * Each `url()` a declaration or an `@font-face`-like descriptor references, with its line; a
 * `url(` inside a string is text.
 */
export function cssUrls(css: string): Array<{ value: string; line: number }> {
  return cssUrlTokens(css).map(({ value, line }) => ({ value, line }));
}

/**
 * The stylesheet with each `url()` that `cssUrls` reports rewritten to `url("<replacement>")`,
 * or left as written when `replace` has none for it.
 */
export function replaceCssUrls(
  css: string,
  replace: (value: string) => string | undefined,
): string {
  let out = css;
  for (const token of cssUrlTokens(css).reverse()) {
    const url = replace(token.value);
    if (url !== undefined) {
      out = `${out.slice(0, token.start)}url("${url}")${out.slice(token.end)}`;
    }
  }
  return out;
}

/** The `url()` tokens of every declaration and descriptor value, with the span each covers in the stylesheet. */
function cssUrlTokens(
  css: string,
): Array<{ value: string; line: number; start: number; end: number }> {
  const decls = collectDeclarations(stripCssCommentsPreserveLines(css), true, true);
  return decls.flatMap((decl) =>
    urlsInValue(decl.value).map((url) => ({
      value: url.value,
      line: decl.line + (decl.value.slice(0, url.index).match(/\n/g)?.length ?? 0),
      start: decl.valueStart + url.index,
      end: decl.valueStart + url.index + url.length,
    })),
  );
}

/** The `url()` tokens of one declaration value, quoted or bare, with where each starts and its length. */
function urlsInValue(value: string): Array<{ value: string; index: number; length: number }> {
  const urls: Array<{ value: string; index: number; length: number }> = [];
  let i = 0;
  while (i < value.length) {
    const ch = value[i];
    if (ch === '"' || ch === "'") {
      i = consumeString(value, i);
      continue;
    }
    const match = /^url\(\s*(["']?)([^"')]*)\1\s*\)/i.exec(value.slice(i));
    if (match) {
      urls.push({ value: (match[2] ?? "").trim(), index: i, length: match[0].length });
      i += match[0].length;
      continue;
    }
    i++;
  }
  return urls;
}

/** The layouts the theme's selectors name through `[data-layout=...]`. */
export function cssLayoutNames(css: string): Set<string> {
  const names = new Set<string>();
  for (const selector of cssSelectors(css)) {
    for (const match of selector.matchAll(LAYOUT_ATTR_RE)) {
      if (match[2]) {
        names.add(match[2]);
      }
    }
  }
  return names;
}

const LAYOUT_ATTR_RE = /\[data-layout\s*=\s*(["']?)([^\]"'\s]+)\1\]/g;

export function topLevelSelectors(css: string): string[] {
  return [...walkRules(stripCssComments(css))]
    .filter((rule) => rule.depth === 0)
    .map((rule) => rule.selector);
}

export function isScopedThemeSelector(selector: string): boolean {
  return selector.split(",").every((part) => {
    const item = part.trim();
    if (!item) {
      return true;
    }
    if (item.startsWith("::view-transition-")) {
      return true;
    }
    return /^\.slide(?=$|[\s[.:#>])/.test(item);
  });
}

/**
 * Scopes a slide's own stylesheet to that slide. A leading `.slide` compound
 * gains `:where([data-slug])`; any other selector is nested under the scoped
 * slide. The scope weighs exactly one `.slide`, so a rule behaves as if it were
 * written at the end of theme.css: it beats the theme's `.slide .x`, and the
 * theme's state rules (`.slide.is-current [data-step]`) still beat it.
 * Local keyframes are renamed so two slides can both define `pop`.
 */
export function scopeSlideCss(css: string, slug: string): string {
  const scope = `.slide:where([data-slug="${slug}"])`;
  const source = stripCssCommentsPreserveLines(css);
  const edits: Array<{ start: number; end: number; text: string }> = [];
  for (const rule of walkRules(source)) {
    if (rule.atPath.some((at) => KEYFRAMES_RE.test(at))) {
      continue;
    }
    const scoped = splitSelectorList(rule.selector)
      .map((part) => {
        const item = part.trim();
        return LEADING_SLIDE_RE.test(item)
          ? `${scope}${item.slice(".slide".length)}`
          : `${scope} ${item}`;
      })
      .join(", ");
    edits.push({
      start: rule.selectorStart,
      end: rule.selectorStart + rule.selector.length,
      text: scoped,
    });
  }
  let out = css;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  const names = [...source.matchAll(/@(?:-\w+-)?keyframes\s+([-_a-zA-Z][-_a-zA-Z0-9]*)/g)].map(
    (match) => match[1] ?? "",
  );
  if (names.length === 0) {
    return out;
  }
  const local = new RegExp(`(?<![-\\w])(${names.map(escapeRegExp).join("|")})(?![-\\w])`, "g");
  const rename = (text: string): string => text.replace(local, `${slug}--$1`);
  return out
    .replace(
      /(@(?:-\w+-)?keyframes\s+)([-_a-zA-Z][-_a-zA-Z0-9]*)/g,
      (_, at, name) => at + rename(name),
    )
    .replace(/(\banimation(?:-name)?\s*:)([^;}]*)/g, (_, prop, value) => prop + rename(value));
}

/** Splits `a, b` on top-level commas only, leaving `:is(.a, .b)` whole. */
export function splitSelectorList(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (quote) {
      if (ch === "\\") {
        i++;
      } else if (ch === quote) {
        quote = "";
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "(" || ch === "[") {
      depth++;
    } else if (ch === ")" || ch === "]") {
      depth--;
    } else if (ch === "," && depth === 0) {
      parts.push(selector.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(selector.slice(start));
  return parts;
}

const LEADING_SLIDE_RE = /^\.slide(?=$|[\s[.:#>+~])/;

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** At-rules whose block holds descriptors, written like declarations, instead of rules. */
const DESCRIPTOR_AT_RULE_RE = /^@(font-face|page|property|counter-style|font-palette-values)\b/i;

/**
 * Every style rule, at any depth. With `descriptors`, an at-rule whose block holds descriptors,
 * such as `@font-face`, comes too, named by its prelude, since its `src` loads a file like a
 * declaration's `url()` does.
 */
function* walkRules(
  source: string,
  options: { descriptors?: boolean } = {},
  start = 0,
  end = source.length,
  atPath: string[] = [],
  depth = 0,
): Generator<CssRule> {
  let i = start;
  while (i < end) {
    while (i < end && /\s/.test(source[i] ?? "")) {
      i++;
    }
    if (i >= end) {
      break;
    }
    if (source[i] === "}") {
      i++;
      continue;
    }
    if (source[i] === "@") {
      const atStart = i;
      i = scanUntilBrace(source, i, end, [";"]);
      if (source[i] === "{") {
        const atName = source.slice(atStart, i).trim();
        const blockEnd = skipBlock(source, i);
        if (options.descriptors && DESCRIPTOR_AT_RULE_RE.test(atName)) {
          yield {
            selector: atName,
            selectorStart: atStart,
            atPath,
            bodyStart: i + 1,
            bodyEnd: blockEnd - 1,
            depth,
          };
        } else {
          yield* walkRules(source, options, i + 1, blockEnd - 1, [...atPath, atName], depth + 1);
        }
        i = blockEnd;
      } else if (source[i] === ";") {
        i++;
      } else {
        break;
      }
      continue;
    }
    const selStart = i;
    i = scanUntilBrace(source, i, end);
    if (source[i] !== "{") {
      break;
    }
    const selector = source.slice(selStart, i).trim();
    const blockEnd = skipBlock(source, i);
    if (selector) {
      yield {
        selector,
        selectorStart: selStart,
        atPath,
        bodyStart: i + 1,
        bodyEnd: blockEnd - 1,
        depth,
      };
    }
    i = blockEnd;
  }
}

function collectDeclarations(
  source: string,
  recurseAt: boolean,
  descriptors = false,
): CssDeclaration[] {
  const decls: CssDeclaration[] = [];
  const lineOf = lineLocator(source);
  for (const rule of walkRules(source, { descriptors })) {
    if (!recurseAt && rule.atPath.length > 0) {
      continue;
    }
    decls.push(
      ...parseRuleDeclarations(source, rule.selector, rule.bodyStart, rule.bodyEnd, lineOf),
    );
  }
  return decls;
}

function parseRuleDeclarations(
  source: string,
  selector: string,
  start: number,
  end: number,
  lineOf: (index: number) => number,
): CssDeclaration[] {
  const decls: CssDeclaration[] = [];
  let i = start;
  while (i < end) {
    while (i < end && /\s/.test(source[i] ?? "")) {
      i++;
    }
    if (i >= end || source[i] === "}") {
      break;
    }
    if (source[i] === "{") {
      i = skipBlock(source, i);
      continue;
    }
    const propStart = i;
    while (
      i < end &&
      source[i] !== ":" &&
      source[i] !== ";" &&
      source[i] !== "{" &&
      source[i] !== "}"
    ) {
      i++;
    }
    if (source[i] !== ":") {
      while (i < end && source[i] !== ";" && source[i] !== "}") {
        i++;
      }
      if (source[i] === ";") {
        i++;
      }
      continue;
    }
    const property = source.slice(propStart, i).trim();
    i++;
    const valueStart = i;
    let depth = 0;
    while (i < end) {
      const ch = source[i];
      if (ch === '"' || ch === "'") {
        i = consumeString(source, i, end);
        continue;
      }
      if (ch === "(") {
        depth++;
      } else if (ch === ")") {
        depth--;
      } else if ((ch === ";" || ch === "}") && depth === 0) {
        break;
      }
      i++;
    }
    const raw = source.slice(valueStart, i);
    const value = raw.trim();
    if (property) {
      decls.push({
        selector,
        property,
        value,
        line: lineOf(propStart),
        valueStart: valueStart + raw.length - raw.trimStart().length,
      });
    }
    if (source[i] === ";") {
      i++;
    }
  }
  return decls;
}

/** 1-based line of an index, from one pass over the newlines instead of one per lookup. */
function lineLocator(source: string): (index: number) => number {
  const newlines: number[] = [];
  for (let i = source.indexOf("\n"); i !== -1; i = source.indexOf("\n", i + 1)) {
    newlines.push(i);
  }
  return (index) => {
    let low = 0;
    let high = newlines.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if ((newlines[mid] ?? Number.POSITIVE_INFINITY) < index) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low + 1;
  };
}

function consumeString(source: string, start: number, end = source.length): number {
  const quote = source[start];
  let i = start + 1;
  while (i < end) {
    const ch = source[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) {
      return i + 1;
    }
    i++;
  }
  return i;
}

function scanUntilBrace(
  source: string,
  start: number,
  end = source.length,
  extraStops: string[] = [],
): number {
  let i = start;
  while (i < end) {
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      i = consumeString(source, i, end);
      continue;
    }
    if (ch === "{" || ch === "}" || extraStops.includes(ch ?? "")) {
      return i;
    }
    i++;
  }
  return i;
}

function skipBlock(source: string, openIndex: number): number {
  let depth = 0;
  let i = openIndex;
  while (i < source.length) {
    i = scanUntilBrace(source, i);
    if (source[i] === "{") {
      depth++;
      i++;
      continue;
    }
    if (source[i] === "}") {
      depth--;
      i++;
      if (depth === 0) {
        return i;
      }
      continue;
    }
    return source.length;
  }
  return source.length;
}

/** The `--*` assignments a stylesheet makes, first assignment of each name, in order. */
export function cssTokenValues(css: string): Array<{ name: string; value: string }> {
  const seen = new Set<string>();
  return cssDeclarations(css).flatMap((decl) => {
    if (!decl.property.startsWith("--") || seen.has(decl.property)) {
      return [];
    }
    seen.add(decl.property);
    return [{ name: decl.property, value: decl.value }];
  });
}

const LAYOUT_EXAMPLE_RE = /\/\*\s*@layout\s+([A-Za-z0-9_-]+)[ \t]*\r?\n([\s\S]*?)\*\//g;

export type ThemeLayout = { name: string; example?: string };

/**
 * The layouts a theme defines, by name, each with the markup its
 * `/* @layout <name> ... *\/` comment gives. A theme documents how a layout
 * expects to be filled that way, and the example travels with the theme.
 */
export function themeLayouts(css: string): ThemeLayout[] {
  const examples = new Map<string, string>();
  for (const match of css.matchAll(LAYOUT_EXAMPLE_RE)) {
    const [, name, body] = match;
    if (name && body !== undefined && !examples.has(name)) {
      examples.set(name, body.trim());
    }
  }
  return [...cssLayoutNames(css)].sort().map((name) => {
    const example = examples.get(name);
    return example === undefined ? { name } : { name, example };
  });
}

/** Classes the player adds at runtime, so a slide's markup never names them. */
const RUNTIME_CLASSES = ["is-current", "is-shown"];

export type SlideUsage = {
  /** Classes the slide's markup uses. */
  classes: Iterable<string>;
  /** The slide's `data-layout`. */
  layout?: string;
  /** The slide's own stylesheet, whose `var()` and animations reach into the theme too. */
  css?: string;
};

type ExcerptEntry = {
  atPath: string[];
  selector: string;
  decls: CssDeclaration[];
  keyframes?: string;
};

/**
 * The part of a theme one slide depends on, as CSS that reads on its own: the
 * rules its classes and layout select, element and state rules under `.slide`,
 * the keyframes those rules animate with, and only the tokens they reach
 * through `var()`. It errs toward keeping a rule, since a rule left out misleads
 * a reader silently while an extra one only costs a line.
 */
export function themeExcerpt(css: string, usage: SlideUsage): string {
  const entries = excerptEntries(css, usage);
  const own = usage.css === undefined ? [] : cssDeclarations(usage.css);
  const styled = [
    ...entries.filter((entry) => !entry.keyframes).flatMap((entry) => entry.decls),
    ...own,
  ].filter((decl) => !decl.property.startsWith("--"));
  const keyframes = animatedKeyframes(styled, entries);
  const kept = entries.filter((entry) => !entry.keyframes || keyframes.has(entry.keyframes));
  const tokens = reachedTokens(
    [...styled, ...kept.filter((entry) => entry.keyframes).flatMap((entry) => entry.decls)],
    cssDeclarations(css),
  );

  return renderExcerpt(
    kept
      .map((entry) => ({
        ...entry,
        decls: entry.decls.filter(
          (decl) => !decl.property.startsWith("--") || tokens.has(decl.property),
        ),
      }))
      .filter((entry) => entry.decls.length > 0),
  );
}

/** Every keyframes block, and every style rule with at least one selector part the slide selects. */
function excerptEntries(css: string, usage: SlideUsage): ExcerptEntry[] {
  const source = stripCssComments(css);
  const lineOf = lineLocator(source);
  const used = new Set([...usage.classes, "slide", ...RUNTIME_CLASSES]);
  const entries: ExcerptEntry[] = [];
  for (const rule of walkRules(source)) {
    const decls = parseRuleDeclarations(
      source,
      rule.selector,
      rule.bodyStart,
      rule.bodyEnd,
      lineOf,
    );
    const keyframes = rule.atPath.find((at) => KEYFRAMES_RE.test(at));
    if (keyframes) {
      entries.push({
        atPath: rule.atPath,
        selector: rule.selector,
        decls,
        keyframes: keyframesName(keyframes),
      });
      continue;
    }
    const parts = splitSelectorList(rule.selector)
      .map((part) => part.trim())
      .filter((part) => part && selectorPartApplies(part, used, usage.layout));
    if (parts.length > 0) {
      entries.push({ atPath: rule.atPath, selector: parts.join(", "), decls });
    }
  }
  return entries;
}

/** The names of the keyframes the kept declarations animate with. */
function animatedKeyframes(styled: CssDeclaration[], entries: ExcerptEntry[]): Set<string> {
  const animations = styled
    .filter((decl) => /^animation(-name)?$/.test(decl.property))
    .map((decl) => decl.value);
  return new Set(
    entries.flatMap((entry) =>
      entry.keyframes && animations.some((value) => mentionsName(value, entry.keyframes ?? ""))
        ? [entry.keyframes]
        : [],
    ),
  );
}

function selectorPartApplies(part: string, used: Set<string>, layout?: string): boolean {
  if (part.startsWith("::view-transition")) {
    return false;
  }
  for (const match of part.matchAll(/\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/g)) {
    if (match[1] && !used.has(match[1])) {
      return false;
    }
  }
  for (const match of part.matchAll(LAYOUT_ATTR_RE)) {
    if (match[2] !== layout) {
      return false;
    }
  }
  return true;
}

function keyframesName(at: string): string {
  return at
    .replace(KEYFRAMES_RE, "")
    .trim()
    .replace(/^(["'])(.*)\1$/, "$2");
}

function mentionsName(value: string, name: string): boolean {
  return new RegExp(`(^|[\\s,])${escapeRegExp(name)}($|[\\s,])`).test(value);
}

function varNames(value: string): string[] {
  return [...value.matchAll(/var\(\s*(--[-\w]+)/g)].map((match) => match[1] ?? "");
}

/** The tokens `decls` use, following each token's own `var()` to the ones it is built from. */
function reachedTokens(decls: CssDeclaration[], all: CssDeclaration[]): Set<string> {
  const definitions = new Map<string, string[]>();
  for (const decl of all) {
    if (decl.property.startsWith("--")) {
      definitions.set(decl.property, [...(definitions.get(decl.property) ?? []), decl.value]);
    }
  }
  const reached = new Set<string>();
  const queue = decls.flatMap((decl) => varNames(decl.value));
  for (let name = queue.pop(); name !== undefined; name = queue.pop()) {
    if (reached.has(name)) {
      continue;
    }
    reached.add(name);
    for (const value of definitions.get(name) ?? []) {
      queue.push(...varNames(value));
    }
  }
  return reached;
}

function renderExcerpt(entries: ExcerptEntry[]): string {
  const lines: string[] = [];
  const open: string[] = [];
  const pad = (depth: number) => "  ".repeat(depth);
  for (const entry of entries) {
    let common = 0;
    while (
      common < open.length &&
      common < entry.atPath.length &&
      open[common] === entry.atPath[common]
    ) {
      common++;
    }
    while (open.length > common) {
      open.pop();
      lines.push(`${pad(open.length)}}`);
    }
    for (const at of entry.atPath.slice(open.length)) {
      lines.push(`${pad(open.length)}${at} {`);
      open.push(at);
    }
    const indent = pad(open.length);
    lines.push(
      `${indent}${entry.selector} {`,
      ...entry.decls.map((decl) => `${indent}  ${decl.property}: ${decl.value};`),
      `${indent}}`,
    );
  }
  while (open.length > 0) {
    open.pop();
    lines.push(`${pad(open.length)}}`);
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}
