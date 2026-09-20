import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { DekError, parseScript } from "../../src/core/index.ts";
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
    expect(() => parseScript(source)).toThrow(DekError);
    try {
      parseScript(source);
    } catch (error) {
      expect(error).toBeInstanceOf(DekError);
      expect((error as DekError).line).toBe(headingLine(source, "## 発表の前日に何をしていますか"));
    }
  });

  test("rejects {#.class} attributes", () => {
    const source = `---
title: Talk
---

## intro {#.class}

body
`;
    expect(() => parseScript(source)).toThrow(DekError);
  });

  test("rejects key=value attributes", () => {
    const source = `---
title: Talk
---

## intro {key=value}

body
`;
    expect(() => parseScript(source)).toThrow(DekError);
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
      throw new Error("expected DekError");
    } catch (error) {
      expect(error).toBeInstanceOf(DekError);
      const message = (error as DekError).message;
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
