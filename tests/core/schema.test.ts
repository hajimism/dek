import { describe, expect, test } from "bun:test";
import { defaultScript } from "../../src/cli/files.ts";
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
  test("defaults ratio to 16:9 and leaves lang for the script to decide", () => {
    expect(Frontmatter.parse({ title: "Talk" })).toEqual({ title: "Talk", ratio: "16:9" });
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

  test("accepts a description for link previews", () => {
    expect(Frontmatter.parse({ title: "Talk", description: "Why slides." }).description).toBe(
      "Why slides.",
    );
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
    expect(() => Deck.parse({ title: "Talk", lang: "en", sections: [] })).toThrow();
    expect(Deck.parse({ title: "Talk", lang: "en", sections: [section] }).sections).toHaveLength(1);
  });
});

describe("frontmatterJsonSchema", () => {
  test("describes title, duration, ratio, and lang for yaml-language-server", () => {
    const schema = frontmatterJsonSchema() as {
      required?: string[];
      properties?: {
        duration?: { pattern?: string };
        ratio?: { enum?: string[] };
        lang?: { default?: string; pattern?: string; description?: string };
      };
    };

    expect(schema.required).toContain("title");
    expect(schema.properties?.duration?.pattern).toBe("^\\d+m$");
    expect(schema.properties?.ratio?.enum).toEqual(["16:9", "4:3"]);
    expect(schema.properties?.lang?.default).toBeUndefined();
    expect(schema.properties?.lang?.description).toContain("script");
    expect(schema.properties?.lang?.pattern).toBe("^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$");
  });
});

describe("frontmatterJsonSchema describes what a script may write", () => {
  type Schema = {
    required?: string[];
    additionalProperties?: boolean;
    properties?: Record<string, { default?: unknown }>;
  };
  const schema = frontmatterJsonSchema() as Schema;

  test("a field with a default is optional", () => {
    const defaulted = Object.entries(schema.properties ?? {})
      .filter(([, property]) => property.default !== undefined)
      .map(([key]) => key);
    expect(defaulted).toContain("ratio");
    for (const key of defaulted) {
      expect(schema.required ?? []).not.toContain(key);
    }
  });

  test("the frontmatter `dek init` writes validates", () => {
    const yaml = defaultScript("Talk").split("---")[1] ?? "";
    const frontmatter = Bun.YAML.parse(yaml) as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      expect(frontmatter).toHaveProperty(key);
    }
    for (const key of Object.keys(frontmatter)) {
      expect(schema.properties).toHaveProperty(key);
    }
  });

  test("still flags a key dek does not read, as DEK008 does", () => {
    expect(schema.additionalProperties).toBe(false);
  });
});
