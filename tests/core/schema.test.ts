import { describe, expect, test } from "bun:test";
import { Deck, Frontmatter, frontmatterJsonSchema, Id } from "../../src/core/index.ts";

describe("Id", () => {
  test.each(["intro", "the-problem", "a1"])("accepts %s", (value) => {
    expect(Id.parse(value)).toBe(value);
  });

  test.each(["123", "Intro", ""])("rejects %j", (value) => {
    expect(() => Id.parse(value)).toThrow();
  });
});

describe("Frontmatter", () => {
  test("defaults ratio to 16:9 and lang to ja", () => {
    expect(Frontmatter.parse({ title: "Talk" })).toEqual({
      title: "Talk",
      ratio: "16:9",
      lang: "ja",
    });
  });

  test("accepts a BCP 47 language tag", () => {
    expect(Frontmatter.parse({ title: "Talk", lang: "en" }).lang).toBe("en");
    expect(Frontmatter.parse({ title: "Talk", lang: "zh-Hans" }).lang).toBe("zh-Hans");
  });

  test.each(["", " ", 'ja"><script'])("rejects invalid lang %j", (lang) => {
    expect(() => Frontmatter.parse({ title: "Talk", lang })).toThrow();
  });

  test("accepts duration like 20m", () => {
    expect(Frontmatter.parse({ title: "Talk", duration: "20m" }).duration).toBe("20m");
  });

  test("rejects duration that is not <n>m", () => {
    expect(() => Frontmatter.parse({ title: "Talk", duration: "20min" })).toThrow();
  });

  test("accepts ISO dates", () => {
    expect(Frontmatter.parse({ title: "Talk", date: "2026-04-18" }).date).toBe("2026-04-18");
  });

  test("rejects non-ISO dates", () => {
    expect(() => Frontmatter.parse({ title: "Talk", date: "April 18" })).toThrow();
  });
});

describe("Deck", () => {
  const section = {
    slug: "intro",
    title: "intro",
    body: "",
    beats: [],
    line: 1,
  };

  test("requires at least one section", () => {
    expect(() => Deck.parse({ title: "Talk", sections: [] })).toThrow();
    expect(Deck.parse({ title: "Talk", sections: [section] }).sections).toHaveLength(1);
  });
});

describe("frontmatterJsonSchema", () => {
  test("describes title, duration, ratio, and lang for yaml-language-server", () => {
    const schema = frontmatterJsonSchema() as {
      required?: string[];
      properties?: {
        duration?: { pattern?: string };
        ratio?: { enum?: string[] };
        lang?: { default?: string; pattern?: string };
      };
    };

    expect(schema.required).toContain("title");
    expect(schema.properties?.duration?.pattern).toBe("^\\d+m$");
    expect(schema.properties?.ratio?.enum).toEqual(["16:9", "4:3"]);
    expect(schema.properties?.lang?.default).toBe("ja");
    expect(schema.properties?.lang?.pattern).toBe("^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$");
  });
});
