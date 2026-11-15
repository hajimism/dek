import { describe, expect, it } from "vitest";
import type {
  CommentPolicy,
  GrantRole,
  GrantSide,
  Visibility,
} from "../../../../src/pub/protocol.ts";
import { ApiError } from "../../src/common/api-error.ts";
import { keepDraft, readDraft } from "../../src/common/ui/drafts.ts";
import {
  canReadComments,
  canReadThread,
  canResolve,
  canSeeThread,
  mayResolve,
  mayWiden,
  mustComment,
  mustResolve,
  scopeFor,
} from "../../src/model/comment/access.ts";
import { placeComment } from "../../src/model/comment/anchor.ts";
import { draftKeys } from "../../src/model/comment/drafts.ts";
import { mustOpenThread } from "../../src/model/comment/new-thread.ts";
import {
  excerpt,
  mayBeNoticed,
  noticeMail,
  noticeRecipients,
} from "../../src/model/comment/notice.ts";
import { locateQuote, quoteAt, segments } from "../../src/model/comment/quote.ts";
import { hideQuotes, isDrawn } from "../../src/model/comment/view.ts";
import { canComment, type OpeningRules, standingOn } from "../../src/model/deck/access.ts";
import { canLike } from "../../src/model/deck/like/like.ts";
import { canPostPublic, mustPostPublic } from "../../src/model/deck/public-comment/access.ts";
import { draftKeys as publicDraftKeys } from "../../src/model/deck/public-comment/drafts.ts";
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

describe("isDrawn", () => {
  it("draws a comment that is open or moved, and not one resolved or detached", () => {
    expect(isDrawn({ status: "open" })).toBe(true);
    expect(isDrawn({ status: "moved" })).toBe(true);
    expect(isDrawn({ status: "resolved" })).toBe(false);
    expect(isDrawn({ status: "detached" })).toBe(false);
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

  it("refuses anyone else with not_yours, naming what they tried", () => {
    expect(() =>
      mustResolve(deck, { authorId: "u2" }, { id: "u2" }, "view", "reopen"),
    ).not.toThrow();
    const refused = (() => {
      try {
        mustResolve(deck, { authorId: "u2" }, { id: "u3" }, "comment", "reopen");
      } catch (error) {
        return error;
      }
    })();
    expect(refused).toBeInstanceOf(ApiError);
    expect(refused).toMatchObject({
      status: 403,
      code: "not_yours",
      message: "only the deck's owner and the comment's author may reopen it",
    });
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

describe("who may read a thread", () => {
  const deck = { ownerId: "u1", visibility: "public" as const, comments: "signed-in" as const };
  const team = { scope: "team" as const };
  const shared = { scope: "shared" as const };

  it("lets the owner read every thread", () => {
    expect(canReadThread(deck, { id: "u1" }, null, "team", team)).toBe(true);
  });

  it("lets the team's side read any thread, and the guests' a shared one", () => {
    expect(canReadThread(deck, { id: "u2" }, "view", "team", team)).toBe(true);
    expect(canReadThread(deck, { id: "u2" }, "view", "guest", shared)).toBe(true);
    expect(canReadThread(deck, { id: "u2" }, "comment", "guest", team)).toBe(false);
  });

  it("lets no one read a thread the deck is not shared with, though the deck is public", () => {
    expect(canReadThread(deck, { id: "u3" }, null, "guest", shared)).toBe(false);
    expect(canReadThread(deck, null, null, "guest", shared)).toBe(false);
  });
});

describe("opening a thread", () => {
  const deck = { currentVersion: 3 };
  const version = { n: 3, slideMap: map([["intro", ["We start here.", "Then we go on."]]]) };
  const quote = (text: string) => ({ kind: "quote" as const, quote: text, prefix: "", suffix: "" });
  const comment = (
    anchor: Partial<{ slug: string; step: string; targets: ReturnType<typeof quote>[] }> = {},
    n?: number,
  ) => ({
    anchor: { slug: "intro", step: "0", targets: [], ...anchor },
    text: "Nice.",
    ...(n === undefined ? {} : { version: n }),
  });

  function refusal(run: () => unknown): unknown {
    try {
      run();
    } catch (error) {
      return error;
    }
    return null;
  }

  it("opens on the current version a slide, beat and passage it has", () => {
    const anchored = comment({ targets: [quote("start here. Then we")] }, 3);
    expect(mustOpenThread(deck, version, anchored, true)).toBe(version);
    expect(mustOpenThread(deck, version, comment(), false)).toBe(version);
  });

  it("tells a page that still shows an older version to reload", () => {
    expect(refusal(() => mustOpenThread(deck, version, comment({}, 2), true))).toMatchObject({
      status: 409,
      code: "stale_version",
    });
  });

  it("refuses a version the deck never had", () => {
    for (const n of [4, 0]) {
      expect(refusal(() => mustOpenThread(deck, version, comment({}, n), true))).toMatchObject({
        status: 422,
        code: "unknown_version",
      });
    }
  });

  it("lets no one the script is hidden from quote it, said there or not", () => {
    for (const text of ["We start here.", "not in the script"]) {
      const quoted = comment({ targets: [quote(text)] });
      expect(refusal(() => mustOpenThread(deck, version, quoted, false))).toMatchObject({
        status: 403,
        code: "script_hidden",
      });
    }
  });

  it("refuses a deck with no version yet", () => {
    expect(
      refusal(() => mustOpenThread({ currentVersion: null }, null, comment(), true)),
    ).toMatchObject({ status: 409, code: "no_version" });
  });

  it("refuses a slide, a beat or a passage the version does not have", () => {
    const cases = [
      [comment({ slug: "outro" }), "unknown_slide"],
      [comment({ step: "1" }), "unknown_step"],
      [comment({ targets: [quote("We end here.")] }), "unknown_quote"],
    ] as const;
    for (const [anchored, code] of cases) {
      expect(refusal(() => mustOpenThread(deck, version, anchored, true))).toMatchObject({
        status: 422,
        code,
      });
    }
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
      publicDraftKeys.comment("d_1", null),
      publicDraftKeys.comment("d_1", "c_1"),
      publicDraftKeys.edit("d_1", "c_1"),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keep the keys drafts were kept under before", () => {
    expect(draftKeys.reply("d_1", "c_1")).toBe("dek.pub:draft:d_1:reply:c_1");
    expect(draftKeys.thread("d_1", on([]))).toBe('dek.pub:draft:d_1:thread:["intro","0",[]]');
    expect(publicDraftKeys.comment("d_1", null)).toBe("dek.pub:draft:d_1:public");
    expect(publicDraftKeys.comment("d_1", "c_1")).toBe("dek.pub:draft:d_1:public-reply:c_1");
    expect(publicDraftKeys.edit("d_1", "c_1")).toBe("dek.pub:draft:d_1:public-edit:c_1");
  });

  it("keys an element by what it is, not by where it was drawn", () => {
    const moved = { ...element, box: { x: 4, y: 2, width: 10, height: 10 } };
    expect(draftKeys.thread("d_1", on([moved]))).toBe(draftKeys.thread("d_1", on([element])));
  });

  it("keeps nothing, and throws nothing, where there is no storage", () => {
    const key = publicDraftKeys.comment("d_1", null);
    expect(() => keepDraft(key, "Thanks!")).not.toThrow();
    expect(readDraft(key)).toBe("");
  });
});

describe("notices", () => {
  const deck = {
    ownerId: "u1",
    visibility: "private" as const,
    comments: "signed-in" as const,
    linkKey: null,
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

  it("quote a comment on one line, cut where it runs long", () => {
    expect(excerpt("  一行目\n\n二行目  ")).toBe("一行目 二行目");
    expect(excerpt("a".repeat(300), 10)).toBe(`${"a".repeat(9)}…`);
    expect(excerpt("short", 10)).toBe("short");
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

// Every visibility by every kind of caller, through what the routes ask in turn: whether the deck
// opens to them (a 404 if not), then what they may do on it. The table is written out by hand, so
// a change to any rule that moves one cell fails here, wherever the rule is.
describe("who may do what with a deck, every visibility by every caller", () => {
  const OWNER = { id: "owner" };
  const KEY = "k".repeat(22);
  type Who =
    | "owner"
    | "teamView"
    | "teamComment"
    | "guestView"
    | "guestComment"
    | "stranger"
    | "strangerKey"
    | "out"
    | "outKey";
  const CALLERS: Record<
    Who,
    {
      person: { id: string } | null;
      grants: { role: GrantRole; side: GrantSide }[];
      key: string | null;
    }
  > = {
    owner: { person: OWNER, grants: [], key: null },
    teamView: { person: { id: "tv" }, grants: [{ role: "view", side: "team" }], key: null },
    teamComment: { person: { id: "tc" }, grants: [{ role: "comment", side: "team" }], key: null },
    guestView: { person: { id: "gv" }, grants: [{ role: "view", side: "guest" }], key: null },
    guestComment: { person: { id: "gc" }, grants: [{ role: "comment", side: "guest" }], key: null },
    stranger: { person: { id: "st" }, grants: [], key: null },
    strangerKey: { person: { id: "sk" }, grants: [], key: KEY },
    out: { person: null, grants: [], key: null },
    outKey: { person: null, grants: [], key: KEY },
  };

  // Opens, then: side, Reads the review threads, Writes them, sees a Team thread, sees a Shared
  // thread, Posts a public comment, Likes. `closed` is a 404.
  const EXPECTED: Record<Visibility, Record<Who, string>> = {
    team: {
      owner: "team R W T S - -",
      teamView: "team R - T S - -",
      teamComment: "team R W T S - -",
      guestView: "closed",
      guestComment: "closed",
      stranger: "closed",
      strangerKey: "closed",
      out: "closed",
      outKey: "closed",
    },
    private: {
      owner: "team R W T S - -",
      teamView: "team R - T S - -",
      teamComment: "team R W T S - -",
      guestView: "guest R - - S - -",
      guestComment: "guest R W - S - -",
      stranger: "closed",
      strangerKey: "closed",
      out: "closed",
      outKey: "closed",
    },
    link: {
      owner: "team R W T S P L",
      teamView: "team R - T S P L",
      teamComment: "team R W T S P L",
      guestView: "guest R - - S P L",
      guestComment: "guest R W - S P L",
      stranger: "closed",
      strangerKey: "guest - - - - P L",
      out: "closed",
      outKey: "guest - - - - - -",
    },
    public: {
      owner: "team R W T S P L",
      teamView: "team R - T S P L",
      teamComment: "team R W T S P L",
      guestView: "guest R - - S P L",
      guestComment: "guest R W - S P L",
      stranger: "guest - - - - P L",
      strangerKey: "guest - - - - P L",
      out: "guest - - - - - -",
      outKey: "guest - - - - - -",
    },
  };

  function cell(deck: OpeningRules, who: Who): string {
    const { person, grants, key } = CALLERS[who];
    const { opens, role, side } = standingOn(deck, person, grants, key);
    if (!opens) {
      return "closed";
    }
    const reads = canReadComments(deck, person, role);
    const flag = (yes: boolean, letter: string) => (yes ? letter : "-");
    return [
      side,
      flag(reads, "R"),
      flag(canComment(deck, person, role), "W"),
      flag(reads && canSeeThread({ scope: "team" }, side), "T"),
      flag(reads && canSeeThread({ scope: "shared" }, side), "S"),
      flag(canPostPublic(deck, person), "P"),
      flag(canLike(deck, person), "L"),
    ].join(" ");
  }

  const deckOf = (visibility: Visibility, comments: CommentPolicy): OpeningRules => ({
    ownerId: OWNER.id,
    visibility,
    comments,
    linkKey: KEY,
  });

  it.each(Object.keys(EXPECTED) as Visibility[])("on a %s deck", (visibility) => {
    const deck = deckOf(visibility, "signed-in");
    const found = Object.fromEntries(
      (Object.keys(CALLERS) as Who[]).map((who) => [who, cell(deck, who)]),
    );
    expect(found).toEqual(EXPECTED[visibility]);
  });

  it.each(Object.keys(EXPECTED) as Visibility[])(
    "on a %s deck with public comments off, the same but no one posts one",
    (visibility) => {
      const deck = deckOf(visibility, "off");
      const found = Object.fromEntries(
        (Object.keys(CALLERS) as Who[]).map((who) => [who, cell(deck, who)]),
      );
      const expected = Object.fromEntries(
        Object.entries(EXPECTED[visibility]).map(([who, row]) => [who, row.replace(" P ", " - ")]),
      );
      expect(found).toEqual(expected);
    },
  );

  it("opens a link deck by its own key alone", () => {
    const deck = deckOf("link", "signed-in");
    for (const key of ["", "K".repeat(22), `${KEY}x`, KEY.slice(1)]) {
      expect(standingOn(deck, { id: "st" }, [], key).opens).toBe(false);
      expect(standingOn(deck, null, [], key).opens).toBe(false);
    }
  });

  it("lets the owner, and the author while the deck is still shared with them, change a thread", () => {
    const deck = deckOf("private", "signed-in");
    const thread = { authorId: "gc" };
    const changes = Object.fromEntries(
      (Object.keys(CALLERS) as Who[]).map((who) => {
        const { person, grants } = CALLERS[who];
        const { role } = standingOn(deck, person, grants, null);
        return [who, canResolve(deck, thread, person, role)];
      }),
    );
    expect(changes).toEqual({
      owner: true,
      teamView: false,
      teamComment: false,
      guestView: false,
      guestComment: true,
      stranger: false,
      strangerKey: false,
      out: false,
      outKey: false,
    });
    // The author, once their grant is gone.
    expect(canResolve(deck, thread, { id: "gc" }, null)).toBe(false);
  });

  it("asks only someone signed out to sign in when comments are refused", () => {
    const refused = (refuse: () => void) => {
      try {
        refuse();
      } catch (error) {
        return error instanceof ApiError ? [error.status, error.code, error.hint] : error;
      }
      return "allowed";
    };
    expect(refused(() => mustComment(false, null))).toEqual([
      403,
      "no_comments",
      "sign in to comment",
    ]);
    expect(refused(() => mustComment(false, { id: "st" }))).toEqual([
      403,
      "no_comments",
      undefined,
    ]);
    expect(refused(() => mustComment(true, { id: "st" }))).toBe("allowed");
    const open = deckOf("public", "signed-in");
    const off = deckOf("public", "off");
    expect(refused(() => mustPostPublic(open, null))).toEqual([
      403,
      "no_comments",
      "sign in to comment",
    ]);
    expect(refused(() => mustPostPublic(off, null))).toEqual([403, "no_comments", undefined]);
    expect(refused(() => mustPostPublic(off, { id: "st" }))).toEqual([
      403,
      "no_comments",
      undefined,
    ]);
    expect(refused(() => mustPostPublic(deckOf("private", "signed-in"), { id: "st" }))).toEqual([
      403,
      "no_comments",
      undefined,
    ]);
    expect(refused(() => mustPostPublic(open, { id: "st" }))).toBe("allowed");
  });
});
