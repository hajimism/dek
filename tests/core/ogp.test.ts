import { describe, expect, test } from "bun:test";
import { ogpHead, parsePublicUrl } from "../../src/core/ogp.ts";

describe("ogpHead", () => {
  test("describes the page with title, description, and locale", () => {
    const head = ogpHead({ title: "Why dek", description: "Slides as a build.", lang: "ja" });
    expect(head).toContain('<meta name="description" content="Slides as a build.">');
    expect(head).toContain('<meta property="og:type" content="website">');
    expect(head).toContain('<meta property="og:title" content="Why dek">');
    expect(head).toContain('<meta property="og:description" content="Slides as a build.">');
    expect(head).toContain('<meta property="og:locale" content="ja_JP">');
    expect(head).toContain('<meta name="twitter:card" content="summary">');
    expect(head).not.toContain("og:image");
    expect(head).not.toContain("og:url");
  });

  test("falls back to the event and date when there is no description", () => {
    const head = ogpHead({ title: "T", event: "TSKaigi 2026", date: "2026-05-12", lang: "en" });
    expect(head).toContain('<meta property="og:description" content="TSKaigi 2026 · 2026-05-12">');
  });

  test("leaves the description out when there is nothing to say", () => {
    const head = ogpHead({ title: "T", lang: "en" });
    expect(head).not.toContain("description");
  });

  test("points og:url and a large card at absolute URLs", () => {
    const head = ogpHead({
      title: "Why dek",
      lang: "en",
      url: "https://example.com/talks/why-dek.html",
      image: { url: "https://example.com/talks/why-dek.png", width: 1280, height: 720 },
    });
    expect(head).toContain(
      '<meta property="og:url" content="https://example.com/talks/why-dek.html">',
    );
    expect(head).toContain('<link rel="canonical" href="https://example.com/talks/why-dek.html">');
    expect(head).toContain(
      '<meta property="og:image" content="https://example.com/talks/why-dek.png">',
    );
    expect(head).toContain('<meta property="og:image:width" content="1280">');
    expect(head).toContain('<meta property="og:image:height" content="720">');
    expect(head).toContain('<meta property="og:image:alt" content="Why dek">');
    expect(head).toContain('<meta name="twitter:card" content="summary_large_image">');
  });

  test("escapes what the author wrote", () => {
    const head = ogpHead({ title: 'A "quoted" <talk>', lang: "en" });
    expect(head).toContain('content="A &quot;quoted&quot; &lt;talk&gt;"');
  });

  test("uses the language as the locale when there is no usual region", () => {
    expect(ogpHead({ title: "T", lang: "en" })).toContain('content="en_US"');
    expect(ogpHead({ title: "T", lang: "zh-Hans" })).toContain('content="zh_CN"');
    expect(ogpHead({ title: "T", lang: "pt-BR" })).toContain('content="pt_BR"');
    expect(ogpHead({ title: "T", lang: "eo" })).not.toContain("og:locale");
  });
});

describe("parsePublicUrl", () => {
  test("ends the URL with a slash, so a deck file name joins onto it", () => {
    expect(parsePublicUrl("https://example.com/talks")).toBe("https://example.com/talks/");
    expect(parsePublicUrl("http://localhost:8080/")).toBe("http://localhost:8080/");
  });

  test("returns undefined for anything a crawler cannot fetch", () => {
    expect(parsePublicUrl("/talks/")).toBeUndefined();
    expect(parsePublicUrl("ftp://example.com/")).toBeUndefined();
    expect(parsePublicUrl("https://example.com/?a=1")).toBeUndefined();
  });
});
