import { describe, expect, it } from "vitest";
import {
  formatDate,
  guessLang,
  pickLang,
  relativeTime,
  slideCount,
  translate,
} from "../../src/common/i18n.ts";
import { excerpt } from "../../src/common/mail.ts";

describe("i18n", () => {
  it("picks ?lang=, then the cookie, then Accept-Language", () => {
    expect(pickLang("ja", "en", "en-US")).toBe("ja");
    expect(pickLang(null, "ja", "en-US")).toBe("ja");
    expect(pickLang(null, null, "fr-FR,ja;q=0.8,en;q=0.5")).toBe("ja");
    expect(pickLang("xx", undefined, "de")).toBe("en");
  });

  it("fills in values", () => {
    expect(translate("en", "talk.position", { n: 3, total: 12 })).toBe("Slide 3 of 12");
    expect(translate("ja", "rollback.title", { n: 3 })).toBe("v3 に戻しますか？");
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

describe("mail", () => {
  it("quotes a comment on one line, cut where it runs long", () => {
    expect(excerpt("  一行目\n\n二行目  ")).toBe("一行目 二行目");
    expect(excerpt("a".repeat(300), 10)).toBe(`${"a".repeat(9)}…`);
    expect(excerpt("short", 10)).toBe("short");
  });
});
