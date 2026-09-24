export const REQUIRED_TOKENS = [
  "--fg",
  "--bg",
  "--accent",
  "--muted",
  "--font-title",
  "--font-body",
  "--size-title",
  "--size-body",
  "--size-caption",
  "--gap",
  "--pad",
  "--radius",
  "--step-transition",
] as const;

const BANNED_UNIT_RE =
  /(?:^|[^A-Za-z0-9_-])(?:\d*\.\d+|\d+\.?\d*)(?:vmin|vmax|rem|px|vw|vh|pt|cm|mm|in|pc|ms|s|Q)(?:$|[^A-Za-z0-9_-])/i;
const HEX_COLOR_RE = /#(?:[0-9a-fA-F]{3,8})\b/;
const COLOR_FN_RE = /\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\s*\(/i;
const IDENT_RE = /[A-Za-z_][\w-]*/g;
const ALLOWED_COLOR_IDENTS = new Set([
  "transparent",
  "currentcolor",
  "inherit",
  "initial",
  "unset",
]);

const NAMED_COLORS = new Set([
  "aliceblue",
  "antiquewhite",
  "aqua",
  "aquamarine",
  "azure",
  "beige",
  "bisque",
  "black",
  "blanchedalmond",
  "blue",
  "blueviolet",
  "brown",
  "burlywood",
  "cadetblue",
  "chartreuse",
  "chocolate",
  "coral",
  "cornflowerblue",
  "cornsilk",
  "crimson",
  "cyan",
  "darkblue",
  "darkcyan",
  "darkgoldenrod",
  "darkgray",
  "darkgreen",
  "darkgrey",
  "darkkhaki",
  "darkmagenta",
  "darkolivegreen",
  "darkorange",
  "darkorchid",
  "darkred",
  "darksalmon",
  "darkseagreen",
  "darkslateblue",
  "darkslategray",
  "darkslategrey",
  "darkturquoise",
  "darkviolet",
  "deeppink",
  "deepskyblue",
  "dimgray",
  "dimgrey",
  "dodgerblue",
  "firebrick",
  "floralwhite",
  "forestgreen",
  "fuchsia",
  "gainsboro",
  "ghostwhite",
  "gold",
  "goldenrod",
  "gray",
  "green",
  "greenyellow",
  "grey",
  "honeydew",
  "hotpink",
  "indianred",
  "indigo",
  "ivory",
  "khaki",
  "lavender",
  "lavenderblush",
  "lawngreen",
  "lemonchiffon",
  "lightblue",
  "lightcoral",
  "lightcyan",
  "lightgoldenrodyellow",
  "lightgray",
  "lightgreen",
  "lightgrey",
  "lightpink",
  "lightsalmon",
  "lightseagreen",
  "lightskyblue",
  "lightslategray",
  "lightslategrey",
  "lightsteelblue",
  "lightyellow",
  "lime",
  "limegreen",
  "linen",
  "magenta",
  "maroon",
  "mediumaquamarine",
  "mediumblue",
  "mediumorchid",
  "mediumpurple",
  "mediumseagreen",
  "mediumslateblue",
  "mediumspringgreen",
  "mediumturquoise",
  "mediumvioletred",
  "midnightblue",
  "mintcream",
  "mistyrose",
  "moccasin",
  "navajowhite",
  "navy",
  "oldlace",
  "olive",
  "olivedrab",
  "orange",
  "orangered",
  "orchid",
  "palegoldenrod",
  "palegreen",
  "paleturquoise",
  "palevioletred",
  "papayawhip",
  "peachpuff",
  "peru",
  "pink",
  "plum",
  "powderblue",
  "purple",
  "rebeccapurple",
  "red",
  "rosybrown",
  "royalblue",
  "saddlebrown",
  "salmon",
  "sandybrown",
  "seagreen",
  "seashell",
  "sienna",
  "silver",
  "skyblue",
  "slateblue",
  "slategray",
  "slategrey",
  "snow",
  "springgreen",
  "steelblue",
  "tan",
  "teal",
  "thistle",
  "tomato",
  "turquoise",
  "violet",
  "wheat",
  "white",
  "whitesmoke",
  "yellow",
  "yellowgreen",
]);

export function isRawThemeValue(property: string, value: string): boolean {
  if (property.startsWith("--")) {
    return false;
  }
  if (hasVarFallback(value)) {
    return true;
  }
  const rest = stripCssFunctions(value, ["var", "url"]);
  if (HEX_COLOR_RE.test(rest) || COLOR_FN_RE.test(rest) || BANNED_UNIT_RE.test(rest)) {
    return true;
  }
  if (hasNamedColor(rest)) {
    return true;
  }
  if (property === "font-family") {
    const leftover = rest.replace(IDENT_RE, (ident) =>
      /^(inherit|initial|unset|revert|revert-layer)$/i.test(ident) ? "" : ident,
    );
    if (leftover.replace(/[\s,]/g, "") !== "") {
      return true;
    }
  }
  return false;
}

type TokenKind = "color" | "font" | "size" | "radius" | "space" | "time";

const TIME_RE = /(?:^|[^A-Za-z0-9_-])(?:\d*\.\d+|\d+\.?\d*)m?s(?:$|[^A-Za-z0-9_-])/i;
const MAX_HINT_TOKENS = 6;

function isColorValue(value: string): boolean {
  return HEX_COLOR_RE.test(value) || COLOR_FN_RE.test(value) || hasNamedColor(value);
}

/** What a token holds, judged from its name and the value the theme gives it. */
function tokenKind(name: string, value: string): TokenKind | undefined {
  if (isColorValue(value)) {
    return "color";
  }
  if (/font/.test(name)) {
    return "font";
  }
  if (TIME_RE.test(value)) {
    return "time";
  }
  if (BANNED_UNIT_RE.test(value)) {
    return /size/.test(name) ? "size" : /radius/.test(name) ? "radius" : "space";
  }
  return undefined;
}

/** The kind of token a declaration wants, or undefined when no token kind fits it. */
function wantedKind(property: string, value: string): TokenKind | undefined {
  const rest = stripCssFunctions(value, ["var", "url"]);
  if (isColorValue(rest)) {
    return "color";
  }
  if (property === "font-family") {
    return "font";
  }
  if (property === "font-size") {
    return "size";
  }
  if (/radius$/.test(property)) {
    return "radius";
  }
  if (/^(margin|padding)(-|$)|^(row-|column-)?gap$/.test(property)) {
    return "space";
  }
  if (/^(transition|animation)(-|$)/.test(property)) {
    return "time";
  }
  return undefined;
}

/**
 * DEK014's hint: the theme tokens that could replace a raw value, such as
 * `use var(--accent) or var(--fg)` for a hex color.
 */
export function rawValueHint(
  property: string,
  value: string,
  tokens: Array<{ name: string; value: string }>,
): string {
  const kind = wantedKind(property, value);
  const names = [
    ...new Set(
      tokens
        .filter((token) => kind && tokenKind(token.name, token.value) === kind)
        .map((t) => t.name),
    ),
  ].sort();
  if (names.length === 0) {
    return "add a token for it to theme.css and use var() here";
  }
  const shown = names.slice(0, MAX_HINT_TOKENS).map((name) => `var(${name})`);
  if (names.length > MAX_HINT_TOKENS) {
    shown.push("…");
  }
  const last = shown.pop();
  if (shown.length === 0) {
    return `use ${last}`;
  }
  return shown.length === 1 ? `use ${shown[0]} or ${last}` : `use ${shown.join(", ")}, or ${last}`;
}

function hasNamedColor(value: string): boolean {
  for (const match of value.matchAll(IDENT_RE)) {
    const ident = match[0]?.toLowerCase();
    if (!ident || ALLOWED_COLOR_IDENTS.has(ident)) {
      continue;
    }
    if (NAMED_COLORS.has(ident)) {
      return true;
    }
  }
  return false;
}

function hasVarFallback(value: string): boolean {
  let i = 0;
  while (i < value.length) {
    const start = value.indexOf("var(", i);
    if (start === -1) {
      return false;
    }
    const inner = functionInner(value, start + 3);
    if (inner === undefined) {
      return false;
    }
    if (hasTopLevelComma(inner.args)) {
      return true;
    }
    i = inner.end;
  }
  return false;
}

function hasTopLevelComma(value: string): boolean {
  let depth = 0;
  let quote: string | undefined;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quote !== undefined) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) {
        quote = undefined;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
    } else if (ch === "," && depth === 0) {
      return true;
    }
  }
  return false;
}

function stripCssFunctions(value: string, names: string[]): string {
  let result = value;
  for (const name of names) {
    const needle = `${name}(`;
    let i = 0;
    let next = "";
    while (i < result.length) {
      const start = result.indexOf(needle, i);
      if (start === -1) {
        next += result.slice(i);
        break;
      }
      next += result.slice(i, start);
      const inner = functionInner(result, start + name.length);
      if (inner === undefined) {
        next += result.slice(start);
        break;
      }
      next += " ";
      i = inner.end;
    }
    result = next;
  }
  return result;
}

function functionInner(
  value: string,
  openIndex: number,
): { args: string; end: number } | undefined {
  if (value[openIndex] !== "(") {
    return undefined;
  }
  let depth = 0;
  let quote: string | undefined;
  for (let i = openIndex; i < value.length; i++) {
    const ch = value[i];
    if (quote !== undefined) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) {
        quote = undefined;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth === 0) {
        return { args: value.slice(openIndex + 1, i), end: i + 1 };
      }
    }
  }
  return undefined;
}
