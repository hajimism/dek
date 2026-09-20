export type CssDeclaration = {
  selector: string;
  property: string;
  value: string;
  line: number;
};

type CssRule = {
  selector: string;
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
