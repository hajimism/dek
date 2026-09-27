import { blankStringsAndComments, cssFunctions, splitTopLevel } from "../css-scan.ts";

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
  const rest = withoutFunctions(value, TOKEN_FUNCTIONS);
  // A string is text: `content: "#fff"` shows the characters, it paints nothing.
  const bare = blankStringsAndComments(rest);
  if (HEX_COLOR_RE.test(bare) || COLOR_FN_RE.test(bare) || BANNED_UNIT_RE.test(bare)) {
    return true;
  }
  if (hasNamedColor(bare)) {
    return true;
  }
  // A family name is raw whether it is quoted or not.
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

/** The functions a design value may be written with: a token, or a file. */
const TOKEN_FUNCTIONS = new Set(["var", "url"]);

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
  const rest = blankStringsAndComments(withoutFunctions(value, TOKEN_FUNCTIONS));
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
 * The theme tokens that could replace a raw value, such as `use var(--accent) or var(--fg)`
 * for a hex color; none when no token holds that kind of value.
 */
export function tokenSuggestion(
  property: string,
  value: string,
  tokens: Array<{ name: string; value: string }>,
): string | undefined {
  const kind = wantedKind(property, value);
  const names = [
    ...new Set(
      tokens
        .filter((token) => kind && tokenKind(token.name, token.value) === kind)
        .map((t) => t.name),
    ),
  ].sort();
  if (names.length === 0) {
    return undefined;
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
  return cssFunctions(value).some(
    (call) => call.name === "var" && splitTopLevel(call.args, ",").length > 1,
  );
}

/** The value with each call to one of `names` replaced by a space; calls inside them go too. */
function withoutFunctions(value: string, names: Set<string>): string {
  let out = "";
  let from = 0;
  for (const call of cssFunctions(value)) {
    if (names.has(call.name) && call.start >= from) {
      out += `${value.slice(from, call.start)} `;
      from = call.end;
    }
  }
  return out + value.slice(from);
}
