import { describe, expect, it } from "vitest";
import type { SlideMap } from "../../../../src/pub/protocol.ts";
import { DeckId } from "../../../../src/pub/protocol.ts";
import { canComment, canManage, canView, type DeckRules } from "../../src/lib/access.ts";
import { placeComment } from "../../src/lib/anchors.ts";
import { deckIdFromHost, deckOrigin } from "../../src/lib/deck-origin.ts";
import { handleFromEmail, isHandle } from "../../src/lib/handle.ts";
import { newDeckId } from "../../src/lib/ids.ts";
import { signServeToken, verifyServeToken } from "../../src/lib/serve-token.ts";
import { slideChanges } from "../../src/lib/slide-diff.ts";

const owner = { id: "u1", handle: "hajimism", name: "Hajime" };
const other = { id: "u2", handle: "sato", name: "Sato" };

describe("access", () => {
  const deck = (
    visibility: DeckRules["visibility"],
    comments: DeckRules["comments"] = "signed-in",
  ) => ({
    ownerId: "u1",
    visibility,
    comments,
  });

  it("keeps a private deck to its owner and grants", () => {
    expect(canView(deck("private"), owner, null)).toBe(true);
    expect(canView(deck("private"), other, null)).toBe(false);
    expect(canView(deck("private"), null, null)).toBe(false);
    expect(canView(deck("private"), other, "view")).toBe(true);
    expect(canComment(deck("private"), other, "view")).toBe(false);
    expect(canComment(deck("private"), other, "comment")).toBe(true);
  });

  it("follows the comment policy on a deck anyone with the link may open", () => {
    expect(canView(deck("link"), null, null)).toBe(true);
    expect(canComment(deck("link", "signed-in"), null, null)).toBe(false);
    expect(canComment(deck("link", "signed-in"), other, null)).toBe(true);
    expect(canComment(deck("link", "guests"), null, null)).toBe(true);
    expect(canComment(deck("public", "off"), other, null)).toBe(false);
    expect(canComment(deck("public", "off"), owner, null)).toBe(true);
  });

  it("lets only the owner manage", () => {
    expect(canManage(deck("public"), owner)).toBe(true);
    expect(canManage(deck("public"), other)).toBe(false);
    expect(canManage(deck("public"), null)).toBe(false);
  });
});

const map = (slides: Array<[string, string[]]>): SlideMap => ({
  deck: "talk",
  out: "talk.html",
  slides: slides.map(([slug, paragraphs]) => ({
    slug,
    title: slug,
    line: 1,
    steps: [{ step: "0", title: slug }],
    script: paragraphs.join("\n\n"),
    paragraphs,
  })),
});

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

describe("slideChanges", () => {
  it("compares a renamed slide with itself under its old name", () => {
    const before = { map: map([["intro", ["one"]]]), shots: { intro: "1" } };
    const after = { map: map([["opening", ["one"]]]), shots: { opening: "1" } };
    for (const slide of after.map.slides) {
      slide.title = "intro";
      slide.steps = [{ step: "0", title: "intro" }];
    }
    expect(slideChanges(before, after, [{ from: "intro", to: "opening" }])).toEqual([]);
  });

  it("lists slides added, changed and removed, picture changes included", () => {
    const before = {
      map: map([
        ["a", ["one"]],
        ["b", ["two"]],
        ["c", ["three"]],
      ]),
      shots: { a: "1", b: "2" },
    };
    const after = {
      map: map([
        ["a", ["one"]],
        ["b", ["two"]],
        ["d", ["four"]],
      ]),
      shots: { a: "1", b: "9" },
    };
    expect(slideChanges(before, after)).toEqual([
      { slug: "b", change: "changed" },
      { slug: "d", change: "added" },
      { slug: "c", change: "removed" },
    ]);
    expect(slideChanges(null, after)).toEqual([]);
  });
});

describe("serve tokens", () => {
  it("round-trips, and refuses tampering and expiry", async () => {
    const claims = { deck: "d_abcdefghij", n: 3, variant: "full" as const, exp: 2000 };
    const token = await signServeToken("s", claims);
    expect(await verifyServeToken("s", token, 1000)).toEqual(claims);
    expect(await verifyServeToken("s", token, 2000)).toBeNull();
    expect(await verifyServeToken("t", token, 1000)).toBeNull();
    const [payload, signature] = token.split(".");
    const other = await signServeToken("s", { ...claims, n: 4 });
    expect(await verifyServeToken("s", `${other.split(".")[0]}.${signature}`, 1000)).toBeNull();
    expect(await verifyServeToken("s", `${payload}`, 1000)).toBeNull();
    expect(await verifyServeToken("s", "not a token", 1000)).toBeNull();
  });
});

describe("deck origins and IDs", () => {
  it("puts each deck on a host of its own and reads it back", () => {
    const id = newDeckId();
    expect(DeckId.safeParse(id).success).toBe(true);
    const origin = deckOrigin("https://d-{id}.dekusercontent.com", id);
    expect(deckIdFromHost(new URL(origin).host)).toBe(id);
    expect(deckIdFromHost("dek.pub")).toBeNull();
    expect(deckIdFromHost("d-x.dekusercontent.com")).toBeNull();
  });

  it("makes handles that fit a URL", () => {
    expect(handleFromEmail("Sato.Taro+test@example.com")).toBe("sato-taro-test");
    expect(isHandle("sato-taro")).toBe(true);
    expect(isHandle("-sato")).toBe(false);
    expect(isHandle("Sato")).toBe(false);
  });
});
