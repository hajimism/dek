/**
 * A declaration's value as CSS reads it: component values, after CSS Syntax Level 3. A number
 * keeps its sign and its unit, a function holds its arguments as values, and a string or a
 * comment is never read as anything else. Rules ask what a value is made of, not what text it
 * matches, so `-12px` is a length and `tan` in `grid-area` is only a name.
 */
export type CssValue =
  | { kind: "ident"; value: string }
  | { kind: "function"; name: string; args: CssValue[] }
  | { kind: "number"; value: number }
  | { kind: "percentage"; value: number }
  | { kind: "dimension"; value: number; unit: string }
  | { kind: "hash"; value: string }
  | { kind: "string"; value: string }
  | { kind: "url"; value: string }
  | { kind: "delim"; value: string };

const NUMBER_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;
const NAME_CHAR_RE = /[-\w\u0080-\uffff]/;

/** Whether `text` at `at` starts an identifier: a letter, `_`, `-` then one, `--`, or `\`. */
function startsIdent(text: string, at: number): boolean {
  const first = text[at] ?? "";
  const second = text[at + 1] ?? "";
  const letter = (ch: string): boolean => /[A-Za-z_\u0080-\uffff\\]/.test(ch);
  return first === "-" ? letter(second) || second === "-" : letter(first);
}

/** Every component value in `text`, spaces and comments dropped. */
export function parseCssValue(text: string): CssValue[] {
  return new ValueReader(text).values(false);
}

/** Every value in `values` and in the arguments of each function, outer before inner. */
export function* walkCssValue(values: CssValue[]): Generator<CssValue> {
  for (const value of values) {
    yield value;
    if (value.kind === "function") {
      yield* walkCssValue(value.args);
    }
  }
}

class ValueReader {
  at = 0;

  constructor(readonly text: string) {}

  /** The values up to the end, or up to the `)` that closes the function being read. */
  values(nested: boolean): CssValue[] {
    const out: CssValue[] = [];
    while (this.at < this.text.length) {
      const ch = this.text[this.at] ?? "";
      if (/\s/.test(ch)) {
        this.at++;
      } else if (ch === "/" && this.text[this.at + 1] === "*") {
        const close = this.text.indexOf("*/", this.at + 2);
        this.at = close < 0 ? this.text.length : close + 2;
      } else if (ch === ")") {
        if (nested) {
          return out;
        }
        this.at++;
      } else {
        out.push(this.value());
      }
    }
    return out;
  }

  value(): CssValue {
    const { text } = this;
    const ch = text[this.at] ?? "";
    if (ch === '"' || ch === "'") {
      return { kind: "string", value: this.string(ch) };
    }
    if (ch === "#" && NAME_CHAR_RE.test(text[this.at + 1] ?? "")) {
      this.at++;
      return { kind: "hash", value: this.name() };
    }
    const number = NUMBER_RE.exec(text.slice(this.at));
    if (number) {
      this.at += number[0].length;
      const value = Number(number[0]);
      if (text[this.at] === "%") {
        this.at++;
        return { kind: "percentage", value };
      }
      return startsIdent(text, this.at)
        ? { kind: "dimension", value, unit: this.name() }
        : { kind: "number", value };
    }
    if (startsIdent(text, this.at)) {
      const name = this.name();
      if (text[this.at] !== "(") {
        return { kind: "ident", value: name };
      }
      this.at++;
      if (name.toLowerCase() === "url" && !/^\s*["']/.test(text.slice(this.at))) {
        const close = text.indexOf(")", this.at);
        const value = text.slice(this.at, close < 0 ? text.length : close).trim();
        this.at = close < 0 ? text.length : close + 1;
        return { kind: "url", value };
      }
      const args = this.values(true);
      this.at++;
      return { kind: "function", name: name.toLowerCase(), args };
    }
    this.at++;
    return { kind: "delim", value: ch };
  }

  name(): string {
    const start = this.at;
    while (this.at < this.text.length) {
      const ch = this.text[this.at] ?? "";
      if (ch === "\\") {
        this.at += 2;
      } else if (NAME_CHAR_RE.test(ch)) {
        this.at++;
      } else {
        break;
      }
    }
    return this.text.slice(start, this.at);
  }

  string(quote: string): string {
    const start = ++this.at;
    while (this.at < this.text.length && this.text[this.at] !== quote) {
      this.at += this.text[this.at] === "\\" ? 2 : 1;
    }
    const value = this.text.slice(start, this.at);
    this.at++;
    return value;
  }
}
