import { type CssValue, parseCssValue } from "../css-value.ts";

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

/**
 * Units that fix a size outside the theme: absolute lengths, the viewport's and a container's
 * units, the root's, and time. Units relative to the element's own font (em, ch, lh, ex, cap, ic)
 * follow the theme's type and stay.
 */
const RAW_UNITS = new Set(
  [
    "px",
    "pt",
    "pc",
    "cm",
    "mm",
    "in",
    "q",
    "rem",
    "rlh",
    "rcap",
    "rch",
    "rex",
    "ric",
    "vw",
    "vh",
    "vi",
    "vb",
    "vmin",
    "vmax",
    ...["s", "l", "d"].flatMap((kind) =>
      ["w", "h", "i", "b", "min", "max"].map((axis) => `${kind}v${axis}`),
    ),
    "cqw",
    "cqh",
    "cqi",
    "cqb",
    "cqmin",
    "cqmax",
    "ms",
    "s",
  ].map((unit) => unit.toLowerCase()),
);
const TIME_UNITS = new Set(["ms", "s"]);

const COLOR_FUNCTIONS = new Set([
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "color",
  "color-mix",
  "light-dark",
]);

/** An easing written out, which motion takes from a token like every other value. */
const EASING_FUNCTIONS = new Set(["cubic-bezier", "steps", "linear"]);

const GLOBAL_KEYWORD_RE = /^(inherit|initial|unset|revert|revert-layer)$/i;

/** What a `font` shorthand may say besides its family: style, weight, stretch, and system fonts. */
const FONT_KEYWORDS = new Set([
  "normal",
  "italic",
  "oblique",
  "small-caps",
  "bold",
  "bolder",
  "lighter",
  "ultra-condensed",
  "extra-condensed",
  "condensed",
  "semi-condensed",
  "semi-expanded",
  "expanded",
  "extra-expanded",
  "ultra-expanded",
  "caption",
  "icon",
  "menu",
  "message-box",
  "small-caption",
  "status-bar",
]);

/** The colors the platform names after its own widgets, which no theme controls. */
const SYSTEM_COLORS = new Set(
  [
    "AccentColor",
    "AccentColorText",
    "ActiveText",
    "ButtonBorder",
    "ButtonFace",
    "ButtonText",
    "Canvas",
    "CanvasText",
    "Field",
    "FieldText",
    "GrayText",
    "Highlight",
    "HighlightText",
    "LinkText",
    "Mark",
    "MarkText",
    "SelectedItem",
    "SelectedItemText",
    "VisitedText",
    "ActiveBorder",
    "ActiveCaption",
    "AppWorkspace",
    "Background",
    "ButtonHighlight",
    "ButtonShadow",
    "CaptionText",
    "InactiveBorder",
    "InactiveCaption",
    "InactiveCaptionText",
    "InfoBackground",
    "InfoText",
    "Menu",
    "MenuText",
    "Scrollbar",
    "ThreeDDarkShadow",
    "ThreeDFace",
    "ThreeDHighlight",
    "ThreeDLightShadow",
    "ThreeDShadow",
    "Window",
    "WindowFrame",
    "WindowText",
  ].map((name) => name.toLowerCase()),
);

/** Shorthands and image properties whose values may hold a color among other things. */
const COLOR_HOLDERS = new Set([
  "background",
  "background-image",
  "border",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-block",
  "border-block-start",
  "border-block-end",
  "border-inline",
  "border-inline-start",
  "border-inline-end",
  "border-image",
  "outline",
  "text-decoration",
  "text-emphasis",
  "column-rule",
  "box-shadow",
  "text-shadow",
  "fill",
  "stroke",
  "filter",
  "backdrop-filter",
  "mask",
  "mask-image",
  "list-style",
  "-webkit-text-stroke",
]);

/** Whether a name in this property's value can be a color: `tan` in `grid-area` is an area. */
function takesColor(property: string): boolean {
  const name = property.toLowerCase();
  return name.startsWith("--") || /(^|-)color$/.test(name) || COLOR_HOLDERS.has(name);
}

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

/**
 * Whether a declaration writes a design value itself instead of taking it from a token: a color,
 * a length or a time in a unit the theme decides, an easing, or a font family. A custom property
 * is where a token is defined, so it is judged where it is set; see `isRawTokenValue`.
 */
export function isRawThemeValue(property: string, value: string): boolean {
  if (property.startsWith("--")) {
    return false;
  }
  const values = parseCssValue(value);
  const name = property.toLowerCase();
  if (hasRawPart(values, takesColor(name))) {
    return true;
  }
  // A family is raw whether it is quoted or not; so is the family a `font` shorthand names.
  if (name === "font-family" || name === "font") {
    return values.some(
      (part) =>
        part.kind === "string" ||
        (part.kind === "ident" &&
          !GLOBAL_KEYWORD_RE.test(part.value) &&
          (name === "font-family" || !FONT_KEYWORDS.has(part.value.toLowerCase()))),
    );
  }
  return false;
}

/** Whether a custom property's value is a raw design value rather than one taken from a token. */
export function isRawTokenValue(value: string): boolean {
  return hasRawPart(parseCssValue(value), true);
}

/**
 * Whether any part of a value is a raw design value. Inside `var()` only a fallback counts, since
 * a fallback is a value written out; inside `url()` nothing does.
 */
function hasRawPart(values: CssValue[], colors: boolean): boolean {
  return values.some((part) => {
    switch (part.kind) {
      case "dimension":
        return RAW_UNITS.has(part.unit.toLowerCase());
      case "hash":
        return true;
      case "ident":
        return colors && isColorName(part.value);
      case "function":
        if (part.name === "var") {
          return part.args.some((arg) => arg.kind === "delim" && arg.value === ",");
        }
        return (
          COLOR_FUNCTIONS.has(part.name) ||
          EASING_FUNCTIONS.has(part.name) ||
          hasRawPart(part.args, colors)
        );
      default:
        return false;
    }
  });
}

function isColorName(ident: string): boolean {
  const name = ident.toLowerCase();
  return NAMED_COLORS.has(name) || SYSTEM_COLORS.has(name);
}

type TokenKind = "color" | "font" | "size" | "radius" | "space" | "time" | "easing";

const MAX_HINT_TOKENS = 6;

/** Whether a value, outside `var()`, holds a color: a hash, a color function, or a named one. */
function isColorValue(values: CssValue[]): boolean {
  return values.some(
    (part) =>
      part.kind === "hash" ||
      (part.kind === "ident" && isColorName(part.value)) ||
      (part.kind === "function" &&
        part.name !== "var" &&
        (COLOR_FUNCTIONS.has(part.name) || isColorValue(part.args))),
  );
}

function hasUnit(values: CssValue[], units: Set<string>): boolean {
  return values.some(
    (part) =>
      (part.kind === "dimension" && units.has(part.unit.toLowerCase())) ||
      (part.kind === "function" && part.name !== "var" && hasUnit(part.args, units)),
  );
}

function hasEasing(values: CssValue[]): boolean {
  return values.some(
    (part) =>
      part.kind === "function" &&
      part.name !== "var" &&
      (EASING_FUNCTIONS.has(part.name) || hasEasing(part.args)),
  );
}

/** What a token holds, judged from its name and the value the theme gives it. */
function tokenKind(name: string, value: string): TokenKind | undefined {
  const values = parseCssValue(value);
  if (isColorValue(values)) {
    return "color";
  }
  // An easing and nothing else; a shorthand that times a transition with one is a time.
  const [only] = values;
  if (values.length === 1 && only?.kind === "function" && EASING_FUNCTIONS.has(only.name)) {
    return "easing";
  }
  if (/font/.test(name)) {
    return "font";
  }
  if (hasUnit(values, TIME_UNITS)) {
    return "time";
  }
  if (hasUnit(values, RAW_UNITS)) {
    return /size/.test(name) ? "size" : /radius/.test(name) ? "radius" : "space";
  }
  return undefined;
}

/** The kind of token a declaration wants, or undefined when no token kind fits it. */
function wantedKind(property: string, value: string): TokenKind | undefined {
  const values = parseCssValue(value);
  if (takesColor(property) && isColorValue(values)) {
    return "color";
  }
  // An easing written out wants an easing token; a duration beside it is already one.
  if (hasEasing(values)) {
    return "easing";
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
