import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser } from "playwright";
import { parseCss } from "../../src/core/css.ts";
import { importPlaywright, playwrightResolved } from "../../src/core/playwright.ts";

// Where dek's stylesheet reader puts each rule, checked against the stylesheet Chromium reads.
const skip = !playwrightResolved() || Boolean(process.env.DEK_PLAYWRIGHT);
const browserTest = test.serial.skipIf(skip);

let browser: Browser | undefined;

beforeAll(async () => {
  if (!skip) {
    browser = await (await importPlaywright()).chromium.launch({ headless: true });
  }
});

afterAll(async () => {
  await browser?.close();
});

/** A rule as both sides can name it: its selector or prelude, and the rules nested in it. */
type RuleTree = { prelude: string; rules: RuleTree[] };

/**
 * A prelude with what Chromium's serializer changes taken out: spaces and quotes, and a keyframe
 * stop's `from` and `to`, which it writes as percentages.
 */
function normalize(prelude: string): string {
  const bare = prelude.replace(/[\s"']/g, "");
  return bare === "from" ? "0%" : bare === "to" ? "100%" : bare;
}

/** The rules dek reads, nested as their blocks are. */
function dekRules(css: string): RuleTree[] {
  const top: RuleTree[] = [];
  const open: Array<{ bodyEnd: number; tree: RuleTree }> = [];
  for (const rule of parseCss(css).rules) {
    while (open.length > 0 && (open.at(-1)?.bodyEnd ?? 0) < rule.preludeStart) {
      open.pop();
    }
    const tree = { prelude: normalize(rule.prelude), rules: [] };
    (open.at(-1)?.tree.rules ?? top).push(tree);
    open.push({ bodyEnd: rule.bodyEnd, tree });
  }
  return top;
}

/** The rules Chromium's CSSStyleSheet reads from each stylesheet, nested as its CSSOM has them. */
async function chromiumRules(sheets: string[]): Promise<RuleTree[][]> {
  if (!browser) {
    throw new Error("no browser");
  }
  const page = await browser.newPage();
  try {
    const read = await page.evaluate((sources) => {
      type Tree = { prelude: string; rules: Tree[] };
      const walk = (rules: CSSRuleList): Tree[] =>
        [...rules]
          // Declarations after a nested rule; they are no rule of their own in the source.
          .filter((rule) => rule.constructor.name !== "CSSNestedDeclarations")
          .map((rule) => {
            const prelude =
              rule instanceof CSSStyleRule
                ? rule.selectorText
                : rule instanceof CSSKeyframeRule
                  ? rule.keyText
                  : rule.cssText.slice(0, rule.cssText.indexOf("{"));
            const nested = "cssRules" in rule ? (rule.cssRules as CSSRuleList) : undefined;
            return { prelude, rules: nested ? walk(nested) : [] };
          });
      return sources.map((source) => {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(source);
        return walk(sheet.cssRules);
      });
    }, sheets);
    const tidy = (trees: RuleTree[]): RuleTree[] =>
      trees.map((tree) => ({ prelude: normalize(tree.prelude), rules: tidy(tree.rules) }));
    return read.map(tidy);
  } finally {
    await page.close();
  }
}

const theme = readFileSync(
  join(import.meta.dir, "..", "..", "src", "theme", "default.css"),
  "utf8",
);

const corpus: Record<string, string> = {
  "a string cut short by CR": 'a{content:"x\r} b{color:red}',
  "a string cut short by FF": 'a{content:"x\f} b{color:red}',
  "a string cut short by CRLF": 'a{content:"x\r\n} b{color:red}',
  "a string carried over CRLF by a backslash": 'a{content:"x\\\r\n} b{}"} c{}',
  "a string carried over a hex escape's newline": 'a{content:"\\41\n} b{}"} c{}',
  "an unquoted url() holding /*": "a{background:url(https://e.x/*.png)} b{color:red}",
  "an unquoted url() holding a quote": "a{background:url(foo'bar)} b{color:red}",
  "an unquoted url() with spaces around it": "a{background:url(  x/*y  )} b{}",
  "an unquoted url() with an escaped )": "a{background:url(x\\)/*)} b{}",
  "an unquoted url() in capitals": "a{background:URL(x/*y)} b{}",
  "an unquoted url() named with an escape": "a{background:u\\72l(x/*y)} b{}",
  "an unquoted url() after a number and a dot": "a{background:1.url(x/*y)} b{}",
  "an unquoted url() broken by a space": "a{background:url(x y/*)} b{}",
  "an unquoted url() broken by a (": "a{background:url(x(y/*)} b{}",
  "an unquoted url() broken by a control character": "a{background:url(x\u0001/*)} b{}",
  "an unquoted url() broken by a backslash and a newline": "a{background:url(x\\\n/*)} b{}",
  "an unclosed url()": "a{background:url(x/*y",
  "url( and a quoted address": 'a{background:url( "x/*y" ) /* } */} b{}',
  "a function named longer than url": "a{background:myurl(x/*y)} b{} */ c{}",
  "a vendor-prefixed url": "a{background:-webkit-url(x/*y)} b{} */ c{}",
  "a hash that reads url": "a{background:#url(x/*y)} b{} */ c{}",
  "a dimension whose unit is url": "a{background:10url(x/*y)} b{} */ c{}",
  "a name that starts with NUL": "a{background:\u0000url(x/*y)} b{} */ c{}",
  "an unquoted url() holding a NUL": "a{background:url(x\u0000/*)} b{}",
  "rules on CRLF lines": "a {\r\n  color: red;\r\n}\r\nb {\r\n  color: blue;\r\n}\r\n",
  "braces in strings and comments": `a::before { content: "}"; } /* } { */ b::after { content: '{'; }
c[title="}{"] { color: red; } d { content: "\\"}" }`,
  "escapes in selectors and values": '.a\\{b { content: "\\7B"; } .c\\} { color: red; }',
  "nested at-rules": `@media (min-width: 1px) {
  @supports (display: grid) { .a { color: red; } @media print { .b { color: blue; } } }
  .c { color: green; }
}
@layer base { .d { color: red; } }
@container (width > 1px) { .e { color: red; } }
.f { color: red; }`,
  "keyframes and font-face": `@keyframes pop { from { opacity: 0; } 50% { opacity: 0.5; } to { opacity: 1; } }
@font-face { font-family: X; src: url(fonts/x.woff2) format("woff2"); }
.g { animation: pop 1s; }`,
  "nested style rules": ".a { color: red; & .b { color: blue; } .c & { color: green; } } .d { }",
  "an unclosed block": ".a { color: red; & .b { color: blue; }",
  "the bundled theme": theme,
};

describe("dek reads a stylesheet's rules where Chromium does", () => {
  browserTest("for every stylesheet in the corpus", async () => {
    const names = Object.keys(corpus);
    const chromium = await chromiumRules(Object.values(corpus));
    const dek = Object.values(corpus).map(dekRules);
    const differ = names.filter((_, i) => !Bun.deepEquals(dek[i], chromium[i]));
    expect(
      differ.map((name) => ({
        name,
        dek: dek[names.indexOf(name)],
        chromium: chromium[names.indexOf(name)],
      })),
    ).toEqual([]);
  });
});
