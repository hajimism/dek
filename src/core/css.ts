export type CssDeclaration = {
  selector: string;
  property: string;
  value: string;
  line: number;
};

export function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function stripCssCommentsPreserveLines(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "));
}

export function cssCustomProperties(css: string): Set<string> {
  const names = new Set<string>();
  for (const decl of collectDeclarations(stripCssCommentsPreserveLines(css), 0, undefined, false)) {
    if (decl.selector === ".slide" && decl.property.startsWith("--")) {
      names.add(decl.property);
    }
  }
  return names;
}

export function cssDeclarations(css: string): CssDeclaration[] {
  return collectDeclarations(stripCssCommentsPreserveLines(css), 0, undefined, true);
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
  return collectSelectors(stripCssComments(css), 0);
}

function collectSelectors(source: string, start: number, end = source.length): string[] {
  const selectors: string[] = [];
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
      while (i < end && source[i] !== "{" && source[i] !== ";") {
        i++;
      }
      if (source[i] === "{") {
        const blockEnd = skipBlock(source, i);
        selectors.push(...collectSelectors(source, i + 1, blockEnd - 1));
        i = blockEnd;
      } else if (source[i] === ";") {
        i++;
      }
      continue;
    }
    const selStart = i;
    while (i < end && source[i] !== "{" && source[i] !== "}") {
      i++;
    }
    if (source[i] !== "{") {
      break;
    }
    const selector = source.slice(selStart, i).trim();
    if (selector) {
      selectors.push(selector);
    }
    i = skipBlock(source, i);
  }
  return selectors;
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
  const source = stripCssComments(css);
  const selectors: string[] = [];
  let i = 0;
  while (i < source.length) {
    while (i < source.length && /\s/.test(source[i] ?? "")) {
      i++;
    }
    if (i >= source.length) {
      break;
    }
    if (source[i] === "@") {
      while (i < source.length && source[i] !== "{" && source[i] !== ";") {
        i++;
      }
      if (source[i] === "{") {
        i = skipBlock(source, i);
      } else if (source[i] === ";") {
        i++;
      }
      continue;
    }
    const start = i;
    while (i < source.length && source[i] !== "{") {
      i++;
    }
    if (i >= source.length) {
      break;
    }
    const selector = source.slice(start, i).trim();
    if (selector) {
      selectors.push(selector);
    }
    i = skipBlock(source, i);
  }
  return selectors;
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

function collectDeclarations(
  source: string,
  start: number,
  end = source.length,
  recurseAt: boolean,
): CssDeclaration[] {
  const decls: CssDeclaration[] = [];
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
      while (i < end && source[i] !== "{" && source[i] !== ";") {
        i++;
      }
      if (source[i] === "{") {
        const blockEnd = skipBlock(source, i);
        if (recurseAt) {
          decls.push(...collectDeclarations(source, i + 1, blockEnd - 1, recurseAt));
        }
        i = blockEnd;
      } else if (source[i] === ";") {
        i++;
      }
      continue;
    }
    const selStart = i;
    while (i < end && source[i] !== "{" && source[i] !== "}") {
      i++;
    }
    if (source[i] !== "{") {
      break;
    }
    const selector = source.slice(selStart, i).trim();
    const blockEnd = skipBlock(source, i);
    decls.push(...parseRuleDeclarations(source, selector, i + 1, blockEnd - 1));
    i = blockEnd;
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
    let quote: string | undefined;
    while (i < end) {
      const ch = source[i];
      if (quote !== undefined) {
        if (ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === quote) {
          quote = undefined;
        }
        i++;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        i++;
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

function skipBlock(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return i + 1;
      }
    }
  }
  return source.length;
}
