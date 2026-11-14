import { describe, expect, it } from "vitest";
import { docsUrl } from "../../src/common/docs.ts";
import {
  formatDate,
  guessLang,
  pickLang,
  relativeTime,
  slideCount,
  translate,
} from "../../src/common/i18n.ts";
import { xmlText } from "../../src/common/xml.ts";

describe("i18n", () => {
  it("picks ?lang=, then the cookie, and Japanese for anyone who has not chosen", () => {
    expect(pickLang("en", "ja")).toBe("en");
    expect(pickLang(null, "en")).toBe("en");
    expect(pickLang(null, null)).toBe("ja");
    expect(pickLang("xx", "fr")).toBe("ja");
  });

  it('signs the footer "Built with dek" in either language', () => {
    expect(translate("ja", "footer.builtWith")).toBe("Built with dek");
    expect(translate("en", "footer.builtWith")).toBe("Built with dek");
  });

  it("fills in values", () => {
    expect(translate("en", "talk.position", { n: 3, total: 12 })).toBe("Slide 3 of 12");
    expect(translate("ja", "manage.version.changed", { n: 3 })).toBe("3 枚が変更");
    expect(slideCount("en", 1)).toBe("1 slide");
    expect(slideCount("ja", 12)).toBe("12 枚");
  });

  it("writes dates and relative times in the page's language", () => {
    expect(formatDate("en", "2026-09-25")).toBe("Sep 25, 2026");
    expect(formatDate("ja", "2026-09-25")).toBe("2026年9月25日");
    const now = Date.parse("2026-11-13T12:00:00Z");
    expect(relativeTime("en", "2026-11-10T12:00:00Z", now)).toBe("3 days ago");
    expect(relativeTime("en", "2026-11-13T11:59:50Z", now)).toBe("just now");
  });
});

describe("guessLang", () => {
  it("reads kana as Japanese, and kanji alone only on a Japanese page", () => {
    expect(guessLang(["台本から、発表まで"])).toBe("ja");
    expect(guessLang(["発表論"])).toBeNull();
    expect(guessLang(["発表論"], "ja")).toBe("ja");
    expect(guessLang(["Why dek"], "ja")).toBeNull();
  });
});

describe("docsUrl", () => {
  it("points at a page of dek's docs, in the reader's language", () => {
    expect(docsUrl("en")).toBe("https://hajimism.github.io/dek/");
    expect(docsUrl("ja")).toBe("https://hajimism.github.io/dek/ja/");
    expect(docsUrl("en", "guide/publish")).toBe(
      "https://hajimism.github.io/dek/guide/publish.html",
    );
    expect(docsUrl("ja", "guide/publish")).toBe(
      "https://hajimism.github.io/dek/ja/guide/publish.html",
    );
  });
});

describe("xmlText", () => {
  it("drops characters XML refuses and escapes the rest", () => {
    expect(xmlText("a\u0000b\u0007c\u000bd & <e> \"f\" 'g'\tok")).toBe(
      "abcd &amp; &lt;e&gt; &quot;f&quot; &apos;g&apos;\tok",
    );
    expect(xmlText("台本 😀")).toBe("台本 😀");
  });
});
