import { type Entry, literal } from "./list.ts";

/** One place an entry is found: where it starts in the block's text, and the text found. */
export type Found = { index: number; text: string };

/**
 * The kana after a godan verb's stem, by the kana its dictionary form ends in: the five of its
 * row, and the euphonic form before て and た (効い, 待っ, 読ん). す has none of its own.
 */
const GODAN_FORMS: Record<string, string> = {
  う: "わいうえおっ",
  く: "かきくけこい",
  ぐ: "がぎぐげごい",
  す: "さしすせそ",
  つ: "たちつてとっ",
  ぬ: "なにぬねのん",
  ぶ: "ばびぶべぼん",
  む: "まみむめもん",
  る: "らりるれろっ",
};

/** Letters of a script written with spaces between words, where a word is matched whole. */
const SPACED = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Nd}]/u;

/** What an entry looks for, as a regular expression with the `u` and `i` flags. */
function source(entry: Entry): string {
  if (entry.pattern !== undefined) {
    return entry.pattern;
  }
  const stem = literal(entry.word.slice(0, -1));
  if (entry.verb === "godan") {
    return `${stem}[${GODAN_FORMS[entry.word.at(-1) ?? ""] ?? ""}]`;
  }
  if (entry.verb === "ichidan") {
    return stem;
  }
  const word = literal(entry.word);
  const opens = SPACED.test(entry.word[0] ?? "") ? `(?<!${SPACED.source})` : "";
  const closes = SPACED.test(entry.word.at(-1) ?? "") ? `(?!${SPACED.source})` : "";
  return `${opens}${word}${closes}`;
}

/** Where `entry` is in a block's text, leaving out each place inside a word it excepts. */
export function finder(entry: Entry): (text: string) => Found[] {
  const pattern = new RegExp(source(entry), "giu");
  const excepts = entry.except.map((word) => new RegExp(literal(word), "giu"));
  return (text) => {
    const excepted = excepts.flatMap((except) =>
      [...text.matchAll(except)].map((match) => [match.index, match.index + match[0].length]),
    );
    return [...text.matchAll(pattern)].flatMap((match): Found[] => {
      const start = match.index;
      const end = start + match[0].length;
      if (match[0] === "" || excepted.some(([from = 0, to = 0]) => from <= start && end <= to)) {
        return [];
      }
      return [{ index: start, text: match[0] }];
    });
  };
}
