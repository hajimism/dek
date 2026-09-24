export type CssDeclaration = {
  selector: string;
  property: string;
  value: string;
  line: number;
};

type CssRule = {
  selector: string;
  selectorStart: number;
  atPath: string[];
  bodyStart: number;
  bodyEnd: number;
  depth: number;
};

export function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
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
    .filter((rule) => !rule.atPath.some((at) => /^@(-\w+-)?keyframes\b/.test(at)))
    .map((rule) => rule.selector);
}

/** Every at-rule name in the stylesheet, such as `font-face` or `media`, in source order. */
export function cssAtRuleNames(css: string): string[] {
  return [...stripCssComments(css).matchAll(/@([-a-zA-Z]+)/g)].map((match) => match[1] ?? "");
}

/** Each `url()` reference with the line it sits on. */
export function cssUrls(css: string): Array<{ value: string; line: number }> {
  const source = stripCssCommentsPreserveLines(css);
  return [...source.matchAll(/url\(\s*(["']?)([^"')]*)\1\s*\)/gi)].map((match) => ({
    value: (match[2] ?? "").trim(),
    line: lineAt(source, match.index ?? 0),
  }));
}

export function cssLayoutNames(css: string): Set<string> {
  const names = new Set<string>();
  for (const match of stripCssComments(css).matchAll(
    /\[data-layout\s*=\s*(["']?)([^\]"'\s]+)\1\]/g,
  )) {
    if (match[2]) {
      names.add(match[2]);
    }
  }
  return names;
}

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
    if (rule.atPath.some((at) => /^@(-\w+-)?keyframes\b/.test(at))) {
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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function* walkRules(
  source: string,
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
        yield* walkRules(source, i + 1, blockEnd - 1, [...atPath, atName], depth + 1);
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

function collectDeclarations(source: string, recurseAt: boolean): CssDeclaration[] {
  const decls: CssDeclaration[] = [];
  for (const rule of walkRules(source)) {
    if (!recurseAt && rule.atPath.length > 0) {
      continue;
    }
    decls.push(...parseRuleDeclarations(source, rule.selector, rule.bodyStart, rule.bodyEnd));
  }
  return decls;
}

function parseRuleDeclarations(
  source: string,
  selector: string,
  start: number,
  end: number,
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
    const value = source.slice(valueStart, i).trim();
    if (property) {
      decls.push({ selector, property, value, line: lineAt(source, propStart) });
    }
    if (source[i] === ";") {
      i++;
    }
  }
  return decls;
}

function lineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (source[i] === "\n") {
      line++;
    }
  }
  return line;
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
