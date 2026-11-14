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
import { draftKeys, keepDraft, readDraft } from "../../src/model/comment/drafts.ts";
import { mayBeNoticed, noticeMail, noticeRecipients } from "../../src/model/comment/notice.ts";
import {
  canPostPublic,
  mayDeletePublic,
  mayEditPublic,
} from "../../src/model/comment/public/access.ts";
import { threadPublic } from "../../src/model/comment/public/view.ts";
import { locateQuote, quoteAt, segments } from "../../src/model/comment/quote.ts";
import { hideQuotes } from "../../src/model/comment/view.ts";
import { opensToAnyone } from "../../src/model/deck/access.ts";
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
    expect(canResolve(deck, { authorId: "u2" }, { id: "u1" }, null)).toBe(true);
    expect(canResolve(deck, { authorId: "u2" }, { id: "u2" }, "comment")).toBe(true);
    expect(canResolve(deck, { authorId: "u2" }, { id: "u2" }, "view")).toBe(true);
    expect(canResolve(deck, { authorId: "u2" }, { id: "u3" }, "comment")).toBe(false);
    expect(canResolve(deck, { authorId: "u2" }, null, null)).toBe(false);
  });

  it("is not an author the deck is no longer shared with", () => {
    expect(canResolve(deck, { authorId: "u2" }, { id: "u2" }, null)).toBe(false);
  });

  it("is the owner and the author, by handle on the page", () => {
    const by = (handle: string) => ({ author: { name: handle, handle } });
    expect(mayResolve(by("sato"), { handle: "sato" }, false)).toBe(true);
    expect(mayResolve(by("sato"), { handle: "kato" }, true)).toBe(true);
    expect(mayResolve(by("sato"), { handle: "kato" }, false)).toBe(false);
    expect(mayResolve(by("sato"), null, true)).toBe(false);
  });

  it("shows a team thread to the team's side only, whatever version it was opened on", () => {
    expect(canSeeThread({ scope: "team" }, "team")).toBe(true);
    expect(canSeeThread({ scope: "team" }, "guest")).toBe(false);
    expect(canSeeThread({ scope: "shared" }, "guest")).toBe(true);
    expect(canSeeThread({ scope: "shared" }, "team")).toBe(true);
  });

  it("reads review threads as the owner or as anyone granted the deck, whatever the policy", () => {
    expect(canReadComments(deck, { id: "u1" }, null)).toBe(true);
    expect(canReadComments(deck, { id: "u2" }, null)).toBe(false);
    expect(canReadComments(deck, null, null)).toBe(false);
    expect(canReadComments({ ...deck, comments: "off" }, { id: "u2" }, "view")).toBe(true);
    expect(
      canReadComments({ ...deck, visibility: "private" as const }, { id: "u2" }, "comment"),
    ).toBe(true);
  });
});

describe("public comments", () => {
  const open = { ownerId: "u1", visibility: "link" as const, comments: "signed-in" as const };
  const mine = { authorId: "u2" };

  it("are on a talk anyone may open, and not on a private one", () => {
    expect(opensToAnyone(open)).toBe(true);
    expect(opensToAnyone({ ...open, visibility: "public" })).toBe(true);
    expect(opensToAnyone({ ...open, visibility: "private" })).toBe(false);
    expect(opensToAnyone({ ...open, visibility: "team" })).toBe(false);
  });

  it("may be posted as the policy says: by anyone signed in, or by no one", () => {
    expect(canPostPublic(open, { id: "u2" })).toBe(true);
    expect(canPostPublic({ ...open, visibility: "public" }, { id: "u2" })).toBe(true);
    expect(canPostPublic({ ...open, comments: "off" }, { id: "u1" })).toBe(false);
    expect(canPostPublic({ ...open, visibility: "private" }, { id: "u1" })).toBe(false);
  });

  it("are never posted by someone signed out, whatever the policy", () => {
    expect(canPostPublic(open, null)).toBe(false);
    expect(canPostPublic({ ...open, visibility: "public" }, null)).toBe(false);
    expect(canPostPublic({ ...open, comments: "off" }, null)).toBe(false);
  });

  it("are edited by their author alone, and deleted by their author or the deck's owner", () => {
    expect(mayEditPublic(mine, { id: "u2" })).toBe(true);
    expect(mayEditPublic(mine, { id: "u1" })).toBe(false);
    expect(mayEditPublic(mine, null)).toBe(false);
    expect(mayDeletePublic(open, mine, { id: "u2" })).toBe(true);
    expect(mayDeletePublic(open, mine, { id: "u1" })).toBe(true);
    expect(mayDeletePublic(open, mine, { id: "u3" })).toBe(false);
    expect(mayDeletePublic(open, mine, null)).toBe(false);
  });

  it("are listed oldest first, each with its replies under it", () => {
    const row = (id: string, parentId: string | null, createdAt: string) => ({
      id,
      parentId,
      createdAt,
    });
    const tree = threadPublic([
      row("p3", "p1", "2026-11-13T03:00:00Z"),
      row("p2", null, "2026-11-13T02:00:00Z"),
      row("p1", null, "2026-11-13T01:00:00Z"),
      row("p4", "p1", "2026-11-13T02:30:00Z"),
      row("p5", "gone", "2026-11-13T04:00:00Z"),
    ]);
    expect(tree.map((top) => [top.id, top.replies.map((reply) => reply.id)])).toEqual([
      ["p1", ["p4", "p3"]],
      ["p2", []],
    ]);
  });
});

describe("thread scope", () => {
  it("opens a team thread for the team's side unless asked, and a shared one for anyone else", () => {
    expect(scopeFor(undefined, "team")).toBe("team");
    expect(scopeFor("shared", "team")).toBe("shared");
    expect(scopeFor(undefined, "guest")).toBe("shared");
    expect(scopeFor("shared", "guest")).toBe("shared");
  });

  it("refuses a team thread from the guests' side", () => {
    expect(() => scopeFor("team", "guest")).toThrow(ApiError);
  });

  it("lets the owner and the author share a team thread, and nothing narrows a shared one", () => {
    const by = (handle: string, scope: "team" | "shared") => ({
      scope,
      author: { name: handle, handle },
    });
    expect(mayWiden(by("sato", "team"), { handle: "sato" }, false)).toBe(true);
    expect(mayWiden(by("sato", "team"), { handle: "kato" }, true)).toBe(true);
    expect(mayWiden(by("sato", "team"), { handle: "kato" }, false)).toBe(false);
    expect(mayWiden(by("sato", "shared"), { handle: "sato" }, true)).toBe(false);
  });
});

describe("drafts", () => {
  const quote = { kind: "quote" as const, quote: "three times", prefix: "", suffix: "" };
  const element = {
    kind: "element" as const,
    path: "slides/intro.html",
    name: "div.chevron",
    text: "Fast",
    box: { x: 0, y: 0, width: 10, height: 10 },
  };
  const on = (targets: (typeof quote | typeof element)[], step = "0") => ({
    slug: "intro",
    step,
    targets,
  });

  it("keys each draft by its deck, its kind and what it answers to", () => {
    const keys = [
      draftKeys.thread("d_1", on([quote])),
      draftKeys.thread("d_2", on([quote])),
      draftKeys.thread("d_1", on([{ ...quote, quote: "faster" }])),
      draftKeys.thread("d_1", on([quote], "1")),
      draftKeys.thread("d_1", on([element])),
      draftKeys.thread("d_1", on([])),
      draftKeys.reply("d_1", "c_1"),
      draftKeys.reply("d_1", "c_2"),
      draftKeys.reply("d_2", "c_1"),
      draftKeys.public("d_1", null),
      draftKeys.public("d_1", "c_1"),
      draftKeys.edit("d_1", "c_1"),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keys an element by what it is, not by where it was drawn", () => {
    const moved = { ...element, box: { x: 4, y: 2, width: 10, height: 10 } };
    expect(draftKeys.thread("d_1", on([moved]))).toBe(draftKeys.thread("d_1", on([element])));
  });

  it("keeps nothing, and throws nothing, where there is no storage", () => {
    const key = draftKeys.public("d_1", null);
    expect(() => keepDraft(key, "Thanks!")).not.toThrow();
    expect(readDraft(key)).toBe("");
  });
});

describe("notices", () => {
  const deck = {
    ownerId: "u1",
    visibility: "private" as const,
    comments: "signed-in" as const,
  };
  const shared = { scope: "shared" as const };
  const team = { scope: "team" as const };
  const held = (side: "team" | "guest" | null, muted = false) => ({
    grants: side ? [{ role: "comment" as const, side }] : [],
    muted,
  });
  it("go to the owner, the author and those who replied, once each, never to who acted", () => {
    expect(
      noticeRecipients({
        ownerId: "u1",
        authorId: "u2",
        replierIds: ["u3", "u2", "u4", "u3"],
        actorId: "u4",
      }),
    ).toEqual(["u1", "u2", "u3"]);
    expect(
      noticeRecipients({ ownerId: "u1", authorId: "u1", replierIds: [], actorId: "u1" }),
    ).toEqual([]);
  });

  it("reach only someone who may read the thread, on their own side, and has not muted the deck", () => {
    expect(mayBeNoticed(deck, shared, { id: "u2" }, held("guest"))).toBe(true);
    expect(mayBeNoticed(deck, team, { id: "u2" }, held("guest"))).toBe(false);
    expect(mayBeNoticed(deck, team, { id: "u2" }, held("team"))).toBe(true);
    expect(mayBeNoticed(deck, team, { id: "u1" }, held(null))).toBe(true);
    expect(mayBeNoticed(deck, shared, { id: "u2" }, held("guest", true))).toBe(false);
    expect(mayBeNoticed(deck, shared, { id: "u2" }, held(null))).toBe(false);
    const teamDeck = { ...deck, visibility: "team" as const };
    expect(mayBeNoticed(teamDeck, shared, { id: "u2" }, held("guest"))).toBe(false);
    expect(mayBeNoticed(teamDeck, shared, { id: "u2" }, held("team"))).toBe(true);
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
