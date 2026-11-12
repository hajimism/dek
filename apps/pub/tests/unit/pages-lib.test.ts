import { describe, expect, it } from "vite-plus/test";
import { hideQuotes } from "../../src/lib/comment-view.ts";
import {
  formatUserCode,
  isCompleteUserCode,
  normalizeUserCode,
} from "../../src/lib/device-code.ts";
import { boxToPercent, readDeckMessage, withSlide } from "../../src/lib/embed.ts";
import {
  formatDate,
  guessLang,
  pickLang,
  relativeTime,
  slideCount,
  translate,
} from "../../src/lib/i18n.ts";
import { safeNext } from "../../src/lib/next-path.ts";
import { handleOf } from "../../src/lib/profile-path.ts";
import { locateQuote, quoteAt, segments } from "../../src/lib/quote.ts";
import { rssDate, xmlText } from "../../src/lib/rss.ts";
import { langHref } from "../../src/ui/lang-link.ts";

describe("quoteAt", () => {
  const text = "今日は、dek というスライドの道具を紹介します。dek は台本を先に書く道具です。";

  it("takes the selection with up to 32 characters on each side", () => {
    const start = text.indexOf("スライド");
    const quote = quoteAt(text, start, start + "スライドの道具".length);
    expect(quote).toEqual({
      quote: "スライドの道具",
      prefix: "今日は、dek という",
      suffix: "を紹介します。dek は台本を先に書く道具です。",
    });
  });

  it("caps the context at 32 characters", () => {
    const long = `${"a".repeat(50)}QUOTE${"b".repeat(50)}`;
    const quote = quoteAt(long, 50, 55);
    expect(quote?.prefix).toBe("a".repeat(32));
    expect(quote?.suffix).toBe("b".repeat(32));
  });

  it("trims whitespace off the edges, and selecting backwards is the same", () => {
    const words = "one  two three";
    expect(quoteAt(words, 8, 3)).toEqual({ quote: "two", prefix: "one  ", suffix: " three" });
  });

  it("is null for a selection of whitespace only", () => {
    expect(quoteAt("a   b", 1, 4)).toBeNull();
  });

  it("caps the quote at 500 characters", () => {
    const quote = quoteAt("x".repeat(800), 0, 800);
    expect(quote?.quote.length).toBe(500);
    expect(quote?.suffix).toBe("x".repeat(32));
  });
});

describe("locateQuote", () => {
  it("picks the occurrence whose surroundings match", () => {
    const text = "dek は速い。だから dek は使える。";
    const second = text.lastIndexOf("dek");
    const quote = quoteAt(text, second, second + 3);
    expect(quote && locateQuote(text, quote)).toEqual({ start: second, end: second + 3 });
  });

  it("is null when the words are gone", () => {
    expect(locateQuote("new text", { quote: "old", prefix: "", suffix: "" })).toBeNull();
  });
});

describe("segments", () => {
  it("cuts text where marks start and end, naming the marks over each piece", () => {
    expect(
      segments("abcdefgh", [
        { id: "c1", start: 1, end: 4 },
        { id: "c2", start: 3, end: 6 },
      ]),
    ).toEqual([
      { text: "a", ids: [] },
      { text: "bc", ids: ["c1"] },
      { text: "d", ids: ["c1", "c2"] },
      { text: "ef", ids: ["c2"] },
      { text: "gh", ids: [] },
    ]);
  });

  it("leaves text without marks whole", () => {
    expect(segments("plain", [])).toEqual([{ text: "plain", ids: [] }]);
  });
});

describe("device code", () => {
  it("takes the code with or without its hyphen, in any case", () => {
    expect(normalizeUserCode("kqwf-xrtm")).toBe("KQWFXRTM");
    expect(normalizeUserCode(" KQWF XRTM ")).toBe("KQWFXRTM");
    expect(formatUserCode("kqwfxrtm")).toBe("KQWF-XRTM");
  });

  it("adds the hyphen only once a fifth character comes, and stops at 8", () => {
    expect(formatUserCode("kqw")).toBe("KQW");
    expect(formatUserCode("kqwf")).toBe("KQWF");
    expect(formatUserCode("kqwfx")).toBe("KQWF-X");
    expect(formatUserCode("kqwf-xrtm-extra")).toBe("KQWF-XRTM");
  });

  it("is complete at 8 characters", () => {
    expect(isCompleteUserCode("KQWF-XRT")).toBe(false);
    expect(isCompleteUserCode("kqwf-xrtm")).toBe(true);
  });
});

describe("safeNext", () => {
  it("keeps a path on this site", () => {
    expect(safeNext("/@demo/why-dek?x=1#intro")).toBe("/@demo/why-dek?x=1#intro");
  });

  it("refuses other origins and odd paths", () => {
    for (const next of ["https://evil.example", "//evil.example", "/\\evil.example", "", null]) {
      expect(safeNext(next)).toBe("/");
    }
  });
});

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

describe("embed messages", () => {
  it("reads a ready message and drops what is not a string", () => {
    const ready = readDeckMessage({
      type: "dek:ready",
      protocol: 1,
      deck: "why-dek",
      size: { width: 1280, height: 720 },
      slides: [{ slug: "cover", steps: ["0", 1] }],
      current: { slug: "cover", step: "0", index: 0 },
    });
    expect(ready).toMatchObject({ type: "dek:ready", slides: [{ slug: "cover", steps: ["0"] }] });
  });

  it("refuses messages with missing or wrong fields", () => {
    expect(readDeckMessage({ type: "dek:moved", slug: "a", step: "0" })).toBeNull();
    expect(
      readDeckMessage({ type: "dek:picked", slug: "a", step: "0", target: { kind: "x" } }),
    ).toBeNull();
    expect(readDeckMessage({ type: "other" })).toBeNull();
    expect(readDeckMessage("dek:ready")).toBeNull();
  });

  it("places a box as fractions of the slide", () => {
    expect(
      boxToPercent({ x: 640, y: 180, width: 128, height: 72 }, { width: 1280, height: 720 }),
    ).toEqual({
      x: 50,
      y: 25,
      width: 10,
      height: 10,
    });
  });

  it("points the iframe at a slide by its fragment only", () => {
    expect(withSlide("http://d-x.localhost/v/1/?t=abc", "intro")).toBe(
      "http://d-x.localhost/v/1/?t=abc#intro",
    );
    expect(withSlide("http://d-x.localhost/v/1/#old", "new")).toBe("http://d-x.localhost/v/1/#new");
  });
});

describe("rss", () => {
  it("drops characters XML refuses and escapes the rest", () => {
    expect(xmlText("a\u0000b\u0007c\u000bd & <e> \"f\" 'g'\tok")).toBe(
      "abcd &amp; &lt;e&gt; &quot;f&quot; &apos;g&apos;\tok",
    );
    expect(xmlText("台本 😀")).toBe("台本 😀");
  });

  it("dates an item by its talk, else its update, else not at all", () => {
    expect(rssDate("2026-09-25", "2026-11-01T00:00:00Z")).toBe("Fri, 25 Sep 2026 00:00:00 GMT");
    expect(rssDate("someday", "2026-11-01T00:00:00Z")).toBe("Sun, 01 Nov 2026 00:00:00 GMT");
    expect(rssDate(null, "not a date")).toBeNull();
  });
});

describe("handleOf", () => {
  it("takes a handle after @ as Hono hands it over, without decoding it again", () => {
    expect(handleOf("@Demo")).toBe("demo");
    expect(handleOf("@%")).toBeNull();
    expect(handleOf("demo")).toBeNull();
    expect(handleOf("@")).toBeNull();
  });
});

describe("hideQuotes", () => {
  it("keeps a quote's place but not its words", () => {
    const hidden = hideQuotes({
      targets: [
        { kind: "quote", quote: "secret words", prefix: "the ", suffix: " here" },
        {
          kind: "element",
          path: "slides/a.html",
          name: "h1",
          text: "Title",
          box: { x: 0, y: 0, width: 1, height: 1 },
        },
      ],
    });
    expect(hidden.targets[0]).toEqual({ kind: "quote", quote: "", prefix: "", suffix: "" });
    expect(hidden.targets[1]?.kind).toBe("element");
  });
});

describe("langHref", () => {
  it("keeps the path, the rest of the query and the fragment", () => {
    expect(langHref(new URL("http://x/@demo/talk?user_code=AB&lang=en#c_1"), "ja")).toBe(
      "/@demo/talk?user_code=AB&lang=ja#c_1",
    );
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
