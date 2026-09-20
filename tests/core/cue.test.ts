import { describe, expect, test } from "bun:test";
import {
  applyDict,
  cuesFromDeck,
  silentCues,
  spokenParagraphs,
  unknownAsciiWords,
  type VoiceDict,
} from "../../src/core/cue.ts";
import { parseScript } from "../../src/core/parse.ts";

const dict: VoiceDict = {
  dek: { kana: "デック" },
  Vite: { kana: "ヴィート", accent: 1 },
  VitePress: { kana: "ヴィートプレス" },
};

describe("spokenParagraphs", () => {
  test("keeps paragraphs and drops blockquotes, lists, fences, and tables", () => {
    expect(
      spokenParagraphs(`hello

> direction only

- list item
* star item
+ plus item
1. numbered

\`\`\`
code fence
\`\`\`

| a | b |
| - | - |
| 1 | 2 |

second paragraph.
`),
    ).toEqual(["hello", "second paragraph."]);
  });

  test("unwraps emphasis, links, and inline code", () => {
    expect(spokenParagraphs("Use `dek` and [Vite](https://vite.dev). **Now.**")).toEqual([
      "Use dek and Vite. Now.",
    ]);
  });

  test("drops images", () => {
    expect(spokenParagraphs("See ![logo](./logo.png) here.")).toEqual(["See here."]);
  });

  test("keeps underscores inside identifiers and unwraps standalone emphasis", () => {
    expect(spokenParagraphs("snake_case_name を使います")).toEqual(["snake_case_name を使います"]);
    expect(spokenParagraphs("これは _強調_ です")).toEqual(["これは 強調 です"]);
    expect(spokenParagraphs("__bold__ and **bold**")).toEqual(["bold and bold"]);
  });

  test("returns an empty list for whitespace-only markdown", () => {
    expect(spokenParagraphs("\n\n> only a note\n")).toEqual([]);
  });
});

describe("applyDict", () => {
  test("replaces the longest key first and keeps ASCII word boundaries", () => {
    expect(applyDict("dek と Vite と VitePress", dict)).toBe(
      "デック と ヴィート と ヴィートプレス",
    );
  });

  test("does not replace a shorter key inside a longer ASCII word", () => {
    expect(applyDict("VitePress", { Vite: { kana: "ヴィート" } })).toBe("VitePress");
  });

  test("leaves unknown words unchanged", () => {
    expect(applyDict("HTML と dek", dict)).toBe("HTML と デック");
  });
});

describe("unknownAsciiWords", () => {
  test("flags ASCII words of length 2+ that are missing from the dict", () => {
    expect(unknownAsciiWords("dek と Vite と HTML と a", dict).sort()).toEqual(["HTML"]);
  });

  test("does not flag single letters", () => {
    expect(unknownAsciiWords("a I x", {})).toEqual([]);
  });

  test("is deterministic and case-sensitive against dict keys", () => {
    expect(unknownAsciiWords("vite dek", dict)).toEqual(["vite"]);
  });
});

describe("cuesFromDeck", () => {
  test("speaks section body at beat 0 and keeps later beats separate", () => {
    const deck = parseScript(`---
title: Talk
---

## architecture

さて、ここがいちばん大事です。

> 時計を見ない。

### script-parent

まず script.md がいて、

### empty

### slides-hang

その下にスライドがぶら下がっている。
`);
    expect(cuesFromDeck(deck)).toEqual([
      {
        position: { slideIndex: 0, beatIndex: 0 },
        slug: "architecture",
        line: 11,
        paragraphs: ["さて、ここがいちばん大事です。", "まず script.md がいて、"],
      },
      {
        position: { slideIndex: 0, beatIndex: 1 },
        slug: "architecture",
        line: 15,
        paragraphs: [],
      },
      {
        position: { slideIndex: 0, beatIndex: 2 },
        slug: "architecture",
        line: 17,
        paragraphs: ["その下にスライドがぶら下がっている。"],
      },
    ]);
  });

  test("uses the section body when a slide has no beats", () => {
    const deck = parseScript(`---
title: Talk
---

## intro

hello
`);
    expect(cuesFromDeck(deck)).toEqual([
      {
        position: { slideIndex: 0, beatIndex: 0 },
        slug: "intro",
        line: 5,
        paragraphs: ["hello"],
      },
    ]);
  });

  test("applies the dict to spoken paragraphs", () => {
    const deck = parseScript(`---
title: Talk
---

## intro

Use \`dek\`.
`);
    expect(cuesFromDeck(deck, dict)[0]?.paragraphs).toEqual(["Use デック."]);
  });
});

describe("silentCues", () => {
  const deck = parseScript(`---
title: Demo
---

## intro

hello

## list-only {#list-only}

- shown but never spoken
- another item

## architecture

### hook {#hook}

spoken here

### quiet {#quiet}

### direction {#direction}

> pause here

### table {#table}

| a | b |
| - | - |
| 1 | 2 |

## joined {#joined}

section paragraph is spoken

### first {#first}

- only a list in the beat body
`);

  test("returns cues whose body is visible but never spoken", () => {
    const silent = silentCues(deck);
    expect(silent.map((cue) => `${cue.slug}#${cue.position.beatIndex}`)).toEqual([
      "list-only#0",
      "architecture#3",
    ]);
  });

  test("carries the beat line so lint can point at script.md", () => {
    const silent = silentCues(deck);
    expect(silent[0]?.line).toBe(9);
    expect(silent[1]?.line).toBe(26);
  });

  test("ignores empty beats and blockquote-only beats", () => {
    const ids = silentCues(deck).map((cue) => cue.position.beatIndex);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(2);
  });
});
