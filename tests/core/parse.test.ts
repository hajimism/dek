import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { DekcError } from "../../src/core/error.ts";
import { parseScript, ScriptError } from "../../src/core/parse.ts";
import { scriptFixturesDir } from "../helpers/paths.ts";

function headingLine(source: string, prefix: string): number {
  const index = source.split("\n").findIndex((line) => line.startsWith(prefix));
  if (index === -1) {
    throw new Error(`heading not found: ${prefix}`);
  }
  return index + 1;
}

describe("parseScript", () => {
  test("parses the README example, ignoring the yaml-language-server comment", async () => {
    const source = await Bun.file(join(scriptFixturesDir, "basic.md")).text();
    const deck = parseScript(source, "script.md");

    expect(deck.title).toBe("HTML スライドツールを作った話");
    expect(deck.event).toBe("Tokyo Frontend Meetup #42");
    expect(deck.date).toBe("2026-04-18");
    expect(deck.duration).toBe("20m");
    expect(deck.ratio).toBe("16:9");
    expect(deck.lang).toBe("ja");
    expect(deck.sections).toHaveLength(3);

    const intro = deck.sections[0];
    expect(intro?.slug).toBe("intro");
    expect(intro?.title).toBe("intro");
    expect(intro?.line).toBe(headingLine(source, "## intro"));
    expect(intro?.body).toContain("こんにちは");
    expect(intro?.body).toContain("自己紹介は短く");
    expect(intro?.beats).toEqual([]);

    const problem = deck.sections[1];
    expect(problem?.slug).toBe("problem");
    expect(problem?.title).toBe("発表の前日に何をしていますか");
    expect(problem?.line).toBe(headingLine(source, "## 発表の前日に何をしていますか"));

    const architecture = deck.sections[2];
    expect(architecture?.slug).toBe("architecture");
    expect(architecture?.title).toBe("architecture");
    expect(architecture?.body).toContain("いちばん覚えて帰ってほしい");
    expect(architecture?.beats.map((beat) => beat.id)).toEqual([
      "script-parent",
      "slides-hang",
      "inverted",
    ]);
    expect(architecture?.beats[0]?.title).toBe("script.md が親");
    expect(architecture?.beats[0]?.line).toBe(headingLine(source, "### script.md が親"));
    expect(architecture?.beats[1]?.title).toBe("スライドがぶら下がる");
    expect(architecture?.beats[2]?.title).toBe("逆だと喋れない");
  });

  test("reads lang from frontmatter", () => {
    const source = `---
title: Talk
lang: en
---

## intro

hello
`;
    expect(parseScript(source).lang).toBe("en");
  });

  test("lets a qualifying heading keep a distinct {#id}", () => {
    const source = `---
title: Talk
---

## intro {#opening}

hello
`;
    const deck = parseScript(source);
    expect(deck.sections[0]?.slug).toBe("opening");
    expect(deck.sections[0]?.title).toBe("intro");
  });

  test("rejects a Japanese heading without {#id}", () => {
    const source = `---
title: Talk
---

## 発表の前日に何をしていますか

body
`;
    expect(() => parseScript(source)).toThrow(DekcError);
    try {
      parseScript(source);
    } catch (error) {
      expect(error).toBeInstanceOf(DekcError);
      expect((error as DekcError).line).toBe(
        headingLine(source, "## 発表の前日に何をしていますか"),
      );
    }
  });

  function hintFor(heading: string): string | undefined {
    try {
      parseScript(`---\ntitle: Talk\n---\n\n${heading}\n\nbody\n`);
    } catch (error) {
      return (error as DekcError).hint;
    }
    throw new Error("expected DekcError");
  }

  test("shows how to add an id to a heading that has none", () => {
    expect(hintFor("## まとめ")).toBe(
      "write it as `## まとめ {#your-id}`; ids use a-z, 0-9, and -",
    );
  });

  test("suggests an id from the ASCII words in the heading", () => {
    expect(hintFor("## Why dekc?")).toBe("write it as `## Why dekc? {#why-dekc}`");
    expect(hintFor("## Vite 8 の新機能")).toBe("write it as `## Vite 8 の新機能 {#vite-8}`");
  });

  test("suggests a lowercase id when the given one is invalid", () => {
    expect(hintFor("## Summary {#Summary_1}")).toBe("write it as `## Summary {#summary-1}`");
    expect(hintFor("## Intro {.lead}")).toBe("write it as `## Intro {#intro}`");
  });

  test("rejects {#.class} attributes", () => {
    const source = `---
title: Talk
---

## intro {#.class}

body
`;
    expect(() => parseScript(source)).toThrow(DekcError);
  });

  test("rejects key=value attributes", () => {
    const source = `---
title: Talk
---

## intro {key=value}

body
`;
    expect(() => parseScript(source)).toThrow(DekcError);
  });

  test("leaves a beat without an id as number-only", () => {
    const source = `---
title: Talk
---

## intro

### ただの区切り

body
`;
    const deck = parseScript(source);
    expect(deck.sections[0]?.beats).toHaveLength(1);
    expect(deck.sections[0]?.beats[0]?.id).toBeUndefined();
    expect(deck.sections[0]?.beats[0]?.title).toBe("ただの区切り");
    expect(deck.sections[0]?.beats[0]?.body).toContain("body");
  });

  test("reports a missing title as 'title: ...' not as JSON", () => {
    try {
      parseScript("---\nevent: x\n---\n\n## intro\n");
      throw new Error("expected DekcError");
    } catch (error) {
      expect(error).toBeInstanceOf(DekcError);
      const message = (error as DekcError).message;
      expect(message.startsWith("title: ")).toBe(true);
      expect(message).not.toMatch(/^\s*\[/);
    }
  });

  test("reports a deck with no sections as a section problem", () => {
    expect(() => parseScript("---\ntitle: T\n---\n\nno headings\n")).toThrow(/^sections: /);
  });

  test("keeps a trailing YAML comment out of the value", () => {
    const deck = parseScript("---\ntitle: T\ndate: 2026-01-01 # tentative\n---\n\n## intro\n");
    expect(deck.date).toBe("2026-01-01");
  });

  test("still keeps a hash that is part of the value", () => {
    expect(parseScript("---\ntitle: Meetup #42\n---\n\n## intro\n").title).toBe("Meetup #42");
    expect(parseScript("---\ntitle: Meetup #42 # ok\n---\n\n## intro\n").title).toBe("Meetup #42");
  });
});

describe("parseScript lang", () => {
  const script = (body: string, lang?: string): string =>
    `---\ntitle: Talk\n${lang ? `lang: ${lang}\n` : ""}---\n\n## intro\n\n${body}\n`;

  test.each([
    ["What you will say comes first.", "en"],
    ["喋る順に、スライドを組み立てる。", "ja"],
    ["漢字だけでもかなが一つあれば日本語", "ja"],
    ["먼저 말할 것을 쓴다", "ko"],
    ["先写你要说的话", "zh"],
  ])("infers lang from the script when frontmatter has none: %j", (body, lang) => {
    expect(parseScript(script(body)).lang).toBe(lang);
  });

  test("keeps the lang frontmatter declares", () => {
    expect(parseScript(script("喋る順に", "en")).lang).toBe("en");
  });
});

describe("parseScript errors", () => {
  const failure = (source: string): { message: string; hint?: string; line?: number } => {
    try {
      parseScript(source, "script.md");
    } catch (error) {
      const { message, hint, line } = error as DekcError;
      return { message, ...(hint ? { hint } : {}), ...(line ? { line } : {}) };
    }
    throw new Error("expected parseScript to fail");
  };

  test("shows the frontmatter to write when script.md has none", () => {
    expect(failure("")).toEqual({
      message: "script.md must start with YAML frontmatter",
      hint: "start it with three lines: ---, title: Your talk, ---",
      line: 1,
    });
  });

  test("says a deck needs a ## heading instead of an array size", () => {
    expect(failure("---\ntitle: Talk\n---\n\njust prose\n").message).toBe(
      "sections: add a ## heading; each one becomes a slide",
    );
  });

  test("gives examples for duration, date, and lang", () => {
    expect(failure("---\ntitle: T\nduration: 10\n---\n\n## a\n").message).toContain(
      "duration: write minutes, like 10m",
    );
    expect(failure("---\ntitle: T\ndate: 18/4\n---\n\n## a\n").message).toContain(
      "date: write a date, like 2026-04-18",
    );
    expect(failure("---\ntitle: T\nlang: en_US\n---\n\n## a\n").message).toContain(
      "lang: write a BCP 47 tag, like en or ja",
    );
  });

  test("keeps YAML's own words for a syntax error, without its class name", () => {
    const { message } = failure("---\ntitle: T\nevent: [open\n---\n\n## a\n");
    expect(message).toBe("invalid YAML frontmatter: YAML Parse error: Unexpected token");
  });
});

describe("parseScript problems", () => {
  function problemsOf(source: string): ScriptError["problems"] {
    try {
      parseScript(source, "script.md");
    } catch (error) {
      expect(error).toBeInstanceOf(ScriptError);
      return (error as ScriptError).problems;
    }
    throw new Error("expected a ScriptError");
  }

  // One run should say everything that stops the script, not the first thing: four headings to
  // fix should take one lint, not five.
  test("reports every problem in the script at once, in order", () => {
    const problems = problemsOf(`---
title: B
---

### early

## 日本語だけ

x

## Bad {#Bad}

### beat {x}
`);
    expect(problems.map(({ message, line }) => ({ message, line }))).toEqual([
      { message: "### beat is not inside a ## section", line: 5 },
      { message: "heading requires {#id}", line: 7 },
      { message: "heading attribute must be {#id}", line: 11 },
      { message: "heading attribute must be {#id}", line: 13 },
    ]);
    expect(problems[1]?.hint).toBe(
      "write it as `## 日本語だけ {#your-id}`; ids use a-z, 0-9, and -",
    );
  });

  test("takes the first problem as the error's own, for commands that stop on it", () => {
    try {
      parseScript("---\ntitle: B\n---\n\n## 日本語\n\n## 英語も {#Bad}\n", "script.md");
    } catch (error) {
      expect(error).toMatchObject({
        message: "heading requires {#id}",
        line: 5,
        path: "script.md",
        hint: "write it as `## 日本語 {#your-id}`; ids use a-z, 0-9, and -",
      });
      return;
    }
    throw new Error("expected a ScriptError");
  });

  test("reports the frontmatter and the headings together", () => {
    const problems = problemsOf("---\ndate: tomorrow\n---\n\n## 日本語\n");
    expect(problems.map((problem) => problem.line)).toEqual([undefined, 5]);
    expect(problems[0]?.message).toContain("title");
  });
});

describe("parseScript literal text", () => {
  // A `##` inside a code block or an HTML comment is text the slide shows or the author hides,
  // never a slide: a talk about Markdown writes them all the time.
  test("reads ## in a fenced code block or an HTML comment as text", () => {
    const deck = parseScript(`---
title: T
---

## intro

\`\`\`\`md
## not a slide
\`\`\`
## still code, since three backticks cannot close four
\`\`\`\`

<!--
## not a slide either
-->

~~~
### nor a beat
~~~
`);
    expect(deck.sections.map((section) => section.slug)).toEqual(["intro"]);
    expect(deck.sections[0]?.beats).toEqual([]);
    expect(deck.sections[0]?.body).toContain("## not a slide");
  });
});
