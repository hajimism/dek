import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/common/api-error.ts";
import {
  canReadComments,
  canResolve,
  canSeeThread,
  mayResolve,
  mayWiden,
  scopeFor,
} from "../../src/model/comment/access.ts";
import { placeComment } from "../../src/model/comment/anchor.ts";
import { mayBeNoticed, noticeMail, noticeRecipients } from "../../src/model/comment/notice.ts";
import { locateQuote, quoteAt, segments } from "../../src/model/comment/quote.ts";
import { hideQuotes } from "../../src/model/comment/view.ts";
import { slideMapOf as map } from "./slide-map.ts";

describe("placeComment", () => {
  const quote = { kind: "quote" as const, quote: "三倍速くなった", prefix: "", suffix: "" };

  it("stays open where the quote is still said", () => {
    const placed = placeComment(
      { slug: "speed", targets: [quote], n: 1, resolved: false },
      map([["speed", ["ビルドが三倍速くなった。"]]]),
      [],
      9,
    );
    expect(placed).toEqual({ slug: "speed", status: "open" });
  });

  it("follows renames that came after the thread, in order", () => {
    const placed = placeComment(
      { slug: "speed", targets: [quote], n: 1, resolved: false },
      map([["faster", ["ビルドが三倍速くなった。"]]]),
      [
        { fromSlug: "speed", toSlug: "fast", n: 2 },
        { fromSlug: "fast", toSlug: "faster", n: 3 },
      ],
      9,
    );
    expect(placed).toEqual({ slug: "faster", status: "moved" });
  });

  it("is detached when the quote is no longer on its slide", () => {
    const placed = placeComment(
      { slug: "speed", targets: [quote], n: 1, resolved: false },
      map([["speed", ["少し速くなった。"]]]),
      [],
      9,
    );
    expect(placed.status).toBe("detached");
  });

  it("finds a quote on another slide when its slide is gone without a rename", () => {
    const placed = placeComment(
      { slug: "speed", targets: [quote], n: 1, resolved: false },
      map([["results", ["結果、三倍速くなった。"]]]),
      [],
      9,
    );
    expect(placed).toEqual({ slug: "results", status: "moved" });
  });

  it("matches across differences in white space", () => {
    const placed = placeComment(
      { slug: "a", targets: [{ ...quote, quote: "It got\n  faster" }], n: 1, resolved: false },
      map([["a", ["It got faster today."]]]),
      [],
      9,
    );
    expect(placed.status).toBe("open");
  });

  it("says resolved for a resolved thread wherever it lands", () => {
    const placed = placeComment(
      { slug: "speed", targets: [], n: 1, resolved: true },
      map([["speed", []]]),
      [],
      9,
    );
    expect(placed.status).toBe("resolved");
  });
});

describe("placeComment on an older version", () => {
  it("applies only the renames up to the version shown", () => {
    const quote = { kind: "quote" as const, quote: "faster", prefix: "", suffix: "" };
    const placed = placeComment(
      { slug: "speed", targets: [quote], n: 1, resolved: false },
      map([["speed", ["It got faster."]]]),
      [{ fromSlug: "speed", toSlug: "fast", n: 3 }],
      2,
    );
    expect(placed).toEqual({ slug: "speed", status: "open" });
  });

  it("finds a quote that runs from one paragraph into the next", () => {
    const quote = { kind: "quote" as const, quote: "end. Start", prefix: "", suffix: "" };
    const placed = placeComment(
      { slug: "a", targets: [quote], n: 1, resolved: false },
      map([["a", ["The end.", "Start again."]]]),
      [],
      1,
    );
    expect(placed.status).toBe("open");
  });
});

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

describe("who may resolve", () => {
  const deck = { ownerId: "u1", visibility: "link" as const, comments: "signed-in" as const };

  it("is the owner and the author, by account on the server", () => {
    expect(canResolve(deck, { authorId: "u2" }, { id: "u1" })).toBe(true);
    expect(canResolve(deck, { authorId: "u2" }, { id: "u2" })).toBe(true);
    expect(canResolve(deck, { authorId: "u2" }, { id: "u3" })).toBe(false);
    expect(canResolve(deck, { authorId: null }, null)).toBe(false);
  });

  it("is the owner and the author, by handle on the page; never for a guest's namesake", () => {
    const by = (handle: string, guest = false) => ({ author: { name: handle, handle, guest } });
    expect(mayResolve(by("sato"), { handle: "sato" }, false)).toBe(true);
    expect(mayResolve(by("sato"), { handle: "kato" }, true)).toBe(true);
    expect(mayResolve(by("sato"), { handle: "kato" }, false)).toBe(false);
    expect(mayResolve(by("sato", true), { handle: "sato" }, false)).toBe(false);
    expect(mayResolve(by("sato"), null, true)).toBe(false);
  });

  it("shows a thread on a version not yet current to the team's side only", () => {
    const shown = { currentVersion: 2 };
    const at = (n: number) => ({ n, scope: "shared" as const });
    expect(canSeeThread(shown, at(2), "client")).toBe(true);
    expect(canSeeThread(shown, at(1), "client")).toBe(true);
    expect(canSeeThread(shown, at(3), "client")).toBe(false);
    expect(canSeeThread(shown, at(3), "team")).toBe(true);
    expect(canSeeThread({ currentVersion: null }, at(1), "client")).toBe(false);
    expect(canSeeThread({ currentVersion: null }, at(1), "team")).toBe(true);
  });

  it("shows a team thread to the team's side only", () => {
    const shown = { currentVersion: 2 };
    const team = { n: 1, scope: "team" as const };
    expect(canSeeThread(shown, team, "team")).toBe(true);
    expect(canSeeThread(shown, team, "client")).toBe(false);
  });

  it("reads comments as the owner, as one who may comment, or as anyone granted the deck", () => {
    expect(canReadComments(deck, { id: "u1" }, null)).toBe(true);
    expect(canReadComments(deck, { id: "u2" }, null)).toBe(true);
    expect(canReadComments({ ...deck, comments: "off" }, { id: "u2" }, null)).toBe(false);
    expect(canReadComments({ ...deck, comments: "off" }, { id: "u2" }, "comment")).toBe(true);
    const closed = { ...deck, visibility: "private" as const };
    expect(canReadComments(closed, { id: "u2" }, "view")).toBe(true);
    expect(canReadComments(closed, { id: "u2" }, null)).toBe(false);
  });
});

describe("thread scope", () => {
  it("opens a team thread for the team's side unless asked, and a shared one for anyone else", () => {
    expect(scopeFor(undefined, "team")).toBe("team");
    expect(scopeFor("shared", "team")).toBe("shared");
    expect(scopeFor(undefined, "client")).toBe("shared");
    expect(scopeFor("shared", "client")).toBe("shared");
  });

  it("refuses a team thread from the client's side", () => {
    expect(() => scopeFor("team", "client")).toThrow(ApiError);
  });

  it("lets the owner and the author share a team thread, and nothing narrows a shared one", () => {
    const by = (handle: string, scope: "team" | "shared") => ({
      scope,
      author: { name: handle, handle, guest: false },
    });
    expect(mayWiden(by("sato", "team"), { handle: "sato" }, false)).toBe(true);
    expect(mayWiden(by("sato", "team"), { handle: "kato" }, true)).toBe(true);
    expect(mayWiden(by("sato", "team"), { handle: "kato" }, false)).toBe(false);
    expect(mayWiden(by("sato", "shared"), { handle: "sato" }, true)).toBe(false);
  });
});

describe("notices", () => {
  const deck = {
    ownerId: "u1",
    visibility: "private" as const,
    comments: "signed-in" as const,
    currentVersion: 2,
  };
  const shared = { n: 1, scope: "shared" as const };
  const team = { n: 1, scope: "team" as const };
  const reader = { role: "comment" as const, side: "client" as const, muted: false };

  it("go to the owner, the author and those who replied, once each, never to who acted", () => {
    expect(
      noticeRecipients({
        ownerId: "u1",
        authorId: "u2",
        replierIds: ["u3", null, "u2", "u4", "u3"],
        actorId: "u4",
      }),
    ).toEqual(["u1", "u2", "u3"]);
    expect(
      noticeRecipients({ ownerId: "u1", authorId: null, replierIds: [], actorId: "u1" }),
    ).toEqual([]);
  });

  it("reach only someone who may read the thread, on their own side, and has not muted the deck", () => {
    expect(mayBeNoticed(deck, shared, { id: "u2" }, reader)).toBe(true);
    expect(mayBeNoticed(deck, team, { id: "u2" }, reader)).toBe(false);
    expect(mayBeNoticed(deck, team, { id: "u2" }, { ...reader, side: "team" })).toBe(true);
    expect(mayBeNoticed(deck, team, { id: "u1" }, { role: null, side: null, muted: false })).toBe(
      true,
    );
    expect(mayBeNoticed(deck, shared, { id: "u2" }, { ...reader, muted: true })).toBe(false);
    expect(mayBeNoticed(deck, shared, { id: "u2" }, { ...reader, role: null, side: null })).toBe(
      false,
    );
    expect(mayBeNoticed(deck, { ...shared, n: 3 }, { id: "u2" }, reader)).toBe(false);
  });

  it("say who did what on which thread, with the words and the way back", () => {
    const base = {
      to: "sato@example.com",
      title: "Why dek",
      label: "T3",
      actor: "Hajime",
      text: "ここは\n言い換えたい",
      url: "https://dek.pub/@hajimism/why-dek",
    };
    const thread = noticeMail({ ...base, event: "thread" });
    expect(thread.subject).toBe("Hajime commented on “Why dek” (#T3)");
    expect(thread.text).toContain("ここは 言い換えたい");
    expect(thread.text).toContain(base.url);
    expect(noticeMail({ ...base, event: "reply" }).subject).toBe(
      "Hajime replied on “Why dek” (#T3)",
    );
    const resolved = noticeMail({ ...base, event: "resolve", text: "" });
    expect(resolved.subject).toBe("Hajime resolved #T3 on “Why dek”");
  });
});
