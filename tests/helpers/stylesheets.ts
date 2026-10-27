import fc from "fast-check";

/**
 * Stylesheets whose block structure the generator knows: rules, at-rules nested in rules and in
 * each other, and declarations whose values hold what has broken dek's scanner before (strings,
 * some cut short by a newline, comments, `url()` quoted, unquoted, and broken, escapes, NUL). Each
 * is written out with the offset of every `{` and the `}` that closes it, so a reader can be held
 * to where the blocks really are.
 */

/** One piece of the text, which nothing is ever inserted into. */
type Piece = { text: string; comment?: boolean } | { block: Piece[] };

type Rule = {
  kind: "style" | "at";
  prelude: Piece[];
  /** What its block holds: declarations and nested rules, or rules alone. */
  holds: "decls" | "rules";
  body: Item[];
};

type Item =
  | { type: "rule"; rule: Rule }
  | { type: "decl"; property: string; value: Piece[] }
  /** An at-rule without a block, `;` included. */
  | { type: "statement"; pieces: Piece[] }
  /** Comments, whitespace, or in a block of declarations an empty one, between items. */
  | { type: "gap"; pieces: Piece[] };

/** A generated stylesheet before it is written out: its rules, and how it ends. */
export type SheetPlan = {
  items: Item[];
  /** Leave the last rule, and the last rule in it, open, and end on what never closes. */
  open: boolean;
  tail: Piece[];
};

/** A block as the generator wrote it. */
export type WrittenBlock = {
  /** `value` is a `{}` block inside a custom property's value, which is no rule. */
  kind: "style" | "at" | "value";
  /** The prelude with its comments and whitespace taken out. */
  prelude: string;
  /** The offset of its `{`, and of the `}` that closes it, or the end of an unclosed one. */
  open: number;
  close: number;
  /** The properties declared directly in it, in order. */
  properties: string[];
};

export type WrittenSheet = { css: string; blocks: WrittenBlock[] };

const piece = (text: string): Piece => ({ text });
const comment = (text: string): Piece => ({ text, comment: true });

const NEWLINES = ["\n", "\r", "\r\n", "\f"] as const;
const HEX_ESCAPE_END_RE = /\\[0-9a-fA-F]{1,6}$/;
const newline = fc.constantFrom(...NEWLINES);
const whitespace = fc.constantFrom(" ", "\t", ...NEWLINES);

/** Text that holds what a reader might mistake for structure. */
const tricky = fc.constantFrom(
  "{",
  "}",
  ";",
  ":",
  "(",
  ")",
  ",",
  "url(",
  "/*",
  "\0",
  "é",
  "x",
  " ",
);

/** A comment, braces, quotes, and `url(` inside it. */
const commentPiece = fc
  .array(fc.oneof(tricky, fc.constantFrom('"', "'", "*", "/", "\n", "\r\n")), { maxLength: 6 })
  .map((parts) => comment(`/*${parts.join("").replaceAll("*/", "* /")}*/`));

/** An escape in a string: a brace or a quote read as a letter, hex, or NUL. */
const escapes = fc.constantFrom("\\{", "\\}", "\\;", '\\"', "\\'", "\\\\", "\\7b", "\\7D ", "\\\0");

function stringContent(quote: string): fc.Arbitrary<string> {
  const other = quote === '"' ? "'" : '"';
  return fc
    .array(
      fc.oneof(
        tricky,
        fc.constant(other),
        fc.constant(`\\${quote}`),
        escapes,
        // A backslash before a newline carries the string on to the next line.
        newline.map((nl) => `\\${nl}`),
      ),
      { maxLength: 6 },
    )
    .map((parts) => parts.join(""));
}

/**
 * A string, closed, or cut short by the newline that ends it. A newline the content's last escape
 * would take, as a hex escape takes the whitespace after it or `\` and CR take an LF, gets a
 * space before it.
 */
const stringPiece = fc
  .tuple(fc.constantFrom('"', "'"), fc.boolean(), newline)
  .chain(([quote, cut, nl]) =>
    stringContent(quote).map((content) => {
      const taken = HEX_ESCAPE_END_RE.test(content) || (content.endsWith("\\\r") && nl === "\n");
      return piece(`${quote}${content}${cut ? `${taken ? " " : ""}${nl}` : quote}`);
    }),
  );

const closedString = fc
  .constantFrom('"', "'")
  .chain((quote) => stringContent(quote).map((content) => `${quote}${content}${quote}`));

/** The function name, as CSS reads `url` in any case or written with an escape. */
const urlName = fc.constantFrom("url", "URL", "Url", "u\\72l", "\\75 rl", "u\\72 l");

/** What an unquoted `url()` may hold, a brace and a comment's opening included. */
const urlChar = fc.oneof(
  fc.constantFrom("a", "/", ".", "{", "}", ";", ",", "*", "/*", "#", "?", "=", "\0", "é"),
  fc.constantFrom("\\)", "\\ ", "\\(", "\\'"),
);

/** What breaks an unquoted `url()`; it still runs to its `)`. */
const urlBreak = fc.constantFrom(" x", '"', "'", "(", "\u0001", "\\\n");

const urlPiece = fc
  .tuple(
    urlName,
    fc.array(urlChar, { maxLength: 5 }),
    fc.option(urlBreak, { nil: undefined }),
    fc.constantFrom("", " ", "\n"),
    fc.oneof(fc.constant(undefined), closedString),
  )
  .map(([name, chars, broken, space, quoted]) =>
    piece(
      quoted === undefined
        ? `${name}(${space}a${chars.join("")}${broken ?? ""}${chars.join("")}${space})`
        : `${name}(${space}${quoted}${space})`,
    ),
  );

const valueToken = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.constantFrom("red", "-webkit-box", "a\\}b", "\\7b", "\\41 x", "x\0y", "é"),
  },
  { weight: 2, arbitrary: fc.constantFrom("1", "1.5", "10px", "50%", "-2em", "#fff") },
  fc.constantFrom("calc(1px + 2px)", "var(--a, b)", "rgb(1 2 3 / 50%)", "!important", "/", ","),
  { weight: 3, arbitrary: stringPiece },
  { weight: 3, arbitrary: urlPiece },
  commentPiece,
  fc.constant(piece("\\\n")),
);

const separator = fc.constantFrom("", " ", ",", " , ", "\n", "\r\n");

const URL_START_RE = /^(?:u|U|\\7)/;

/**
 * Tokens with what separates them. A `url()` never follows a name it would run on from: a hex
 * escape takes one whitespace after it, so after one the separator is a comma.
 */
function tokens(token: fc.Arbitrary<Piece | string>, maxLength: number): fc.Arbitrary<Piece[]> {
  return fc.array(fc.tuple(separator, token), { maxLength }).map((pairs) => {
    let before = "";
    return pairs.flatMap(([sep, next], at) => {
      const tokenPiece = typeof next === "string" ? piece(next) : next;
      const text = "text" in tokenPiece ? tokenPiece.text : "";
      const url = at > 0 && URL_START_RE.test(text);
      const spaced = url && HEX_ESCAPE_END_RE.test(before) ? "," : url && sep === "" ? " " : sep;
      before = text;
      return at === 0 || spaced === "" ? [tokenPiece] : [piece(spaced), tokenPiece];
    });
  });
}

/**
 * A custom property's value, which may hold `{}` blocks of its own; a `;` ends the declaration
 * only outside them.
 */
const customValue = fc.letrec<{ value: Piece[]; block: Piece }>((tie) => ({
  value: tokens(fc.oneof({ weight: 4, arbitrary: valueToken }, fc.constant(":"), tie("block")), 3),
  block: tokens(
    fc.oneof({ weight: 4, arbitrary: valueToken }, fc.constantFrom(":", ";", "a: b"), tie("block")),
    3,
  ).map((inner): Piece => ({ block: inner })),
})).value;

const declaration = fc.oneof(
  fc.tuple(
    fc.constantFrom("color", "background", "content", "-webkit-mask", "\\63olor"),
    tokens(valueToken, 4),
  ),
  fc.tuple(fc.constantFrom("--x", "--empty", "--a-b"), customValue),
);

const gap = (inDecls: boolean) =>
  fc
    .array(
      fc.oneof(commentPiece, whitespace.map(piece), ...(inDecls ? [fc.constant(piece(";"))] : [])),
      {
        minLength: 1,
        maxLength: 2,
      },
    )
    .map((pieces): Item => ({ type: "gap", pieces }));

const compound = fc.constantFrom(
  ".a",
  ".slide",
  "#id",
  "div",
  "*",
  '[data-x="}"]',
  "[title='{;']",
  '[data-y="a\\"b/*"]',
  ":is(.a, .b)",
  ':not([x="/*"])',
  "::before",
  ".a\\{b",
  ".\\31 0",
  ".x\0y",
);
const combinator = fc.constantFrom("", " ", " > ", " + ", " ~ ", ", ", ",\n");

function selector(first: fc.Arbitrary<string>): fc.Arbitrary<Piece[]> {
  return fc
    .tuple(first, fc.array(fc.tuple(combinator, compound), { maxLength: 3 }))
    .map(([head, rest]) => [
      piece(head),
      ...rest.flatMap(([sep, next]) => (sep === "" ? [piece(next)] : [piece(sep), piece(next)])),
    ]);
}

/** A nested selector: never one a reader could take for a custom property. */
const nestedSelector = selector(
  fc.oneof(compound, fc.constantFrom("&:hover", "& .b", "> p", "&.d", "& + &", ":is(&, .e)")),
);

const atPrelude = (names: readonly string[]) =>
  fc
    .tuple(
      fc.constantFrom(...names),
      fc.constantFrom(
        "",
        " screen",
        " (min-width: 600px)",
        '(x: "}")',
        " not (a: b)",
        " card (width > 1px)",
        " base",
      ),
    )
    .map(([name, rest]) => (rest === "" ? [piece(name)] : [piece(name), piece(rest)]));

const statement = fc
  .oneof(
    urlPiece.map((url) => [piece("@import"), piece(" "), url]),
    closedString.map((text) => [piece("@import"), piece(" "), piece(text), piece(" screen")]),
    fc.constant([piece("@layer"), piece(" a, b")]),
    closedString.map((text) => [piece("@charset"), piece(" "), piece(text)]),
  )
  .map((pieces): Item => ({ type: "statement", pieces: [...pieces, piece(";")] }));

function ruleItem(kind: Rule["kind"], holds: Rule["holds"], prelude: Piece[], body: Item[]): Item {
  return { type: "rule", rule: { kind, holds, prelude, body } };
}

/** The items of a block of declarations, which nests rules and at-rules `depth` deep. */
function declItems(depth: number): fc.Arbitrary<Item[]> {
  const decl = declaration.map(([property, value]): Item => ({ type: "decl", property, value }));
  const nested =
    depth > 0
      ? [
          fc
            .tuple(nestedSelector, declItems(depth - 1))
            .map(([prelude, body]) => ruleItem("style", "decls", prelude, body)),
          fc
            .tuple(
              atPrelude(["@media", "@supports", "@layer", "@container", "@starting-style"]),
              declItems(depth - 1),
            )
            .map(([prelude, body]) => ruleItem("at", "decls", prelude, body)),
        ]
      : [];
  return fc.array(fc.oneof({ weight: 3, arbitrary: decl }, gap(true), ...nested), {
    maxLength: 4,
  });
}

const keyframes = fc
  .tuple(
    fc.constantFrom("@keyframes pop", "@-webkit-keyframes pop", '@keyframes "a{b"'),
    fc.array(fc.tuple(fc.constantFrom("from", "to", "50%", "0%, 100%"), declItems(0)), {
      maxLength: 3,
    }),
  )
  .map(([name, stops]) =>
    ruleItem(
      "at",
      "rules",
      [piece(name)],
      stops.map(([stop, body]) => ruleItem("style", "decls", [piece(stop)], body)),
    ),
  );

const descriptors = fc
  .tuple(fc.constantFrom("@font-face", "@page :first", "@property --x"), declItems(0))
  .map(([name, body]) => ruleItem("at", "decls", [piece(name)], body));

/** The items of a block of rules, the stylesheet's own or an at-rule's, `depth` deep. */
function ruleItems(depth: number, top: boolean): fc.Arbitrary<Item[]> {
  const style = fc
    .tuple(selector(compound), declItems(depth))
    .map(([prelude, body]) => ruleItem("style", "decls", prelude, body));
  const grouping =
    depth > 0
      ? [
          fc
            .tuple(
              atPrelude([
                "@media",
                "@supports",
                "@layer",
                "@container",
                "@scope",
                "@starting-style",
              ]),
              ruleItems(depth - 1, false),
            )
            .map(([prelude, body]) => ruleItem("at", "rules", prelude, body)),
        ]
      : [];
  return fc.array(
    fc.oneof(
      { weight: 4, arbitrary: style },
      gap(false),
      keyframes,
      descriptors,
      ...grouping,
      ...(top ? [statement] : []),
    ),
    { maxLength: 4 },
  );
}

/** What a stylesheet may end on that never closes. */
const tail = fc.oneof(
  fc.constant<Piece[]>([]),
  closedString.map((text): Piece[] => [piece(text.slice(0, -1))]),
  fc.constant<Piece[]>([comment("/* } never closed")]),
  fc.constantFrom("url(x/*y", "url(x y}", "\\").map((text): Piece[] => [piece(text)]),
);

export const sheetPlan: fc.Arbitrary<SheetPlan> = fc.record({
  items: ruleItems(2, true).filter((items) => items.length > 0),
  open: fc.boolean(),
  tail,
});

/** Inserted between pieces: nothing, whitespace, or a comment. */
export const paddings = fc.array(
  fc.oneof(
    { weight: 3, arbitrary: fc.constant("") },
    whitespace,
    fc.constantFrom("/**/", "/* { */", " /* ; } */ ", "\r\n/* url( */"),
  ),
  { maxLength: 6 },
);

const CSS_WHITESPACE_RE = /[ \t\n\r\f]/g;

/**
 * The stylesheet written out, with `paddings` put between its pieces in turn, and every block in
 * the order its `{` comes. An open sheet leaves its last rule open, and the last in that, and
 * ends on its tail, which a block of declarations reads as a value.
 */
export function writeSheet(plan: SheetPlan, padding: readonly string[] = []): WrittenSheet {
  let css = "";
  let turn = 0;
  const blocks: WrittenBlock[] = [];
  const write = (text: string) => {
    if (css !== "" && padding.length > 0) {
      css += padding[turn++ % padding.length];
    }
    css += text;
  };
  const writePieces = (pieces: Piece[]) => {
    for (const next of pieces) {
      if ("block" in next) {
        const block: WrittenBlock = {
          kind: "value",
          prelude: "",
          open: 0,
          close: 0,
          properties: [],
        };
        write("{");
        block.open = css.length - 1;
        blocks.push(block);
        writePieces(next.block);
        write("}");
        block.close = css.length - 1;
      } else {
        write(next.text);
      }
    }
  };
  /** `holds` is what the block the items are in holds: the sheet's own holds rules. */
  const writeItems = (
    items: Item[],
    owner: { block: WrittenBlock; holds: Rule["holds"] } | undefined,
    openLast: boolean,
  ) => {
    // The last item that is not a gap may leave off its `;`, or stay open; an open block keeps
    // nothing after it, so the tail is the last thing written.
    const last = items.findLastIndex((item) => item.type !== "gap");
    for (const [at, item] of (openLast ? items.slice(0, last + 1) : items).entries()) {
      if (item.type === "gap" || item.type === "statement") {
        writePieces(item.pieces);
      } else if (item.type === "decl") {
        owner?.block.properties.push(item.property);
        writePieces([piece(item.property), piece(":"), ...item.value]);
        if (at !== last) {
          write(";");
        }
      } else {
        writeRule(item.rule, openLast && at === last);
      }
    }
    if (openLast && items[last]?.type !== "rule") {
      writeTail(owner);
    }
  };
  /** The tail as a value where declarations are read, or a comment that never closes elsewhere. */
  const writeTail = (owner: { block: WrittenBlock; holds: Rule["holds"] } | undefined) => {
    if (plan.tail.length === 0) {
      return;
    }
    if (owner?.holds === "decls") {
      write(";");
      owner.block.properties.push("tail");
      writePieces([piece("tail"), piece(":"), ...plan.tail]);
    } else if (plan.tail.every((next) => "comment" in next && next.comment)) {
      writePieces(plan.tail);
    }
  };
  const writeRule = (rule: Rule, open: boolean) => {
    writePieces(rule.prelude);
    const block: WrittenBlock = {
      kind: rule.kind,
      prelude: rule.prelude
        .flatMap((next) => ("text" in next && !next.comment ? [next.text] : []))
        .join("")
        .replace(CSS_WHITESPACE_RE, ""),
      open: 0,
      close: 0,
      properties: [],
    };
    write("{");
    block.open = css.length - 1;
    blocks.push(block);
    writeItems(rule.body, { block, holds: rule.holds }, open);
    if (open) {
      closeAtEnd.push(block);
    } else {
      write("}");
      block.close = css.length - 1;
    }
  };
  const closeAtEnd: WrittenBlock[] = [];
  writeItems(plan.items, undefined, plan.open);
  for (const block of closeAtEnd) {
    block.close = css.length;
  }
  return { css, blocks };
}
