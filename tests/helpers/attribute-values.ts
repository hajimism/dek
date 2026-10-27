/**
 * Attribute values as written, each with the value the browser reads: what the decoder must
 * return, and what Chromium is checked to return in attribute-value-browser.test.ts. None holds a
 * `"`, so each can be written between double quotes.
 */
export const ATTRIBUTE_VALUES: ReadonlyArray<readonly [written: string, read: string]> = [
  // Numeric references, with and without their `;`, in decimal and in hex.
  ["&#65;", "A"],
  ["&#65", "A"],
  ["&#65a", "Aa"],
  ["&#x41;", "A"],
  ["&#X41", "A"],
  ["&#x41g", "Ag"],
  ["&#0000065;", "A"],
  ["&#x1F600;", "\u{1F600}"],
  ["&#13;&#10;", "\r\n"],
  ["&#1;", "\u0001"],
  ["&#xFFFE;", "\uFFFE"],
  // NUL, a surrogate, and past Unicode read as U+FFFD.
  ["&#0;", "\uFFFD"],
  ["&#xD800;", "\uFFFD"],
  ["&#xDFFF;", "\uFFFD"],
  ["&#x110000;", "\uFFFD"],
  ["&#99999999999999999999;", "\uFFFD"],
  // 0x80 to 0x9F read as Windows-1252, except the five it leaves undefined.
  ["&#128;", "\u20AC"],
  ["&#x81;", "\u0081"],
  ["&#x8D;", "\u008D"],
  ["&#x92;", "\u2019"],
  ["&#x9F;", "\u0178"],
  // A numeric reference with no digits stays as written.
  ["&#;", "&#;"],
  ["&#x;", "&#x;"],
  ["&#", "&#"],
  ["&#x", "&#x"],
  ["&#xg", "&#xg"],
  // Named references, case and all.
  ["&amp;", "&"],
  ["&amp;x", "&x"],
  ["&amp;=", "&="],
  ["&amp&lt;", "&<"],
  ["&nbsp;", "\u00A0"],
  ["&notin;", "\u2209"],
  ["&not;", "\u00AC"],
  ["&NotEqualTilde;", "\u2242\u0338"],
  ["&CounterClockwiseContourIntegral;", "\u2233"],
  ["&fjlig;", "fj"],
  ["&Amp;", "&Amp;"],
  ["&nonexistent;", "&nonexistent;"],
  // A legacy name without its `;`: read, unless a letter, a digit, or `=` follows it.
  ["&amp", "&"],
  ["&amp x", "& x"],
  ["&AMP", "&"],
  ["&not", "\u00AC"],
  ["&copy-", "\u00A9-"],
  ["&copy.", "\u00A9."],
  ["&frac12", "\u00BD"],
  ["&nbsp", "\u00A0"],
  ["&ampx", "&ampx"],
  ["&amp=x", "&amp=x"],
  ["&copy2", "&copy2"],
  ["&lt=", "&lt="],
  ["&lt;=", "<="],
  ["?a=1&copy=2", "?a=1&copy=2"],
  ["?a=1&copy;=2", "?a=1\u00A9=2"],
  ["&notin", "&notin"],
  ["&notit;", "&notit;"],
  ["&frac1", "&frac1"],
  // A name the standard reads only with its `;`.
  ["&hellip", "&hellip"],
  // An ampersand that starts no reference.
  ["&", "&"],
  ["& ", "& "],
  ["&&", "&&"],
  ["&;", "&;"],
  ["a & b", "a & b"],
  // A carriage return, which the input stream reads as a line feed before the tokenizer sees it,
  // and a NUL, which the tokenizer reads as U+FFFD in a value.
  ["a\r\nb", "a\nb"],
  ["a\rb", "a\nb"],
  ["a\0b", "a\uFFFDb"],
  ["a\tb\nc", "a\tb\nc"],
  // Values from slides.
  ["assets/Q&amp;A.png", "assets/Q&A.png"],
  ["&#106;avascript:alert(1)", "javascript:alert(1)"],
  ["java&#x09;script:alert(1)", "java\tscript:alert(1)"],
  ["h&#116;tps://e.com/a&amp;b.png", "https://e.com/a&b.png"],
  ["a&#32;b", "a b"],
];
