import { describe, expect, it, vi } from "vitest";
import { CreateDeckRequest, DeckId, PROTOCOL_VERSION } from "../../../../src/pub/protocol.ts";
import { newDeckId, newLinkKey, sameKey } from "../../src/common/ids.ts";
import {
  canComment,
  canManage,
  canSeeScript,
  canView,
  type DeckRules,
  type OpeningRules,
  opensWithoutGrant,
  sideOf,
  standingOn,
  versionStanding,
} from "../../src/model/deck/access.ts";
import {
  keyed,
  sharePatch,
  talkHref,
  talkNamed,
  talkPath,
  withLinkKey,
} from "../../src/model/deck/deck.ts";
import { newRenames, readManifest } from "../../src/model/deck/feature/publish/manifest.ts";
import { slideChanges } from "../../src/model/deck/feature/publish/slide-diff.ts";
import { sitemapOf } from "../../src/model/deck/feature/sitemap/sitemap.ts";
import {
  boxToPercent,
  readDeckMessage,
  withSlide,
} from "../../src/model/deck/feature/talk/embed.ts";
import { readingSlug } from "../../src/model/deck/feature/talk/reading.ts";
import { granteeOf, strongestRole, widestSide } from "../../src/model/deck/grant/grant.ts";
import { invitationMail } from "../../src/model/deck/grant/invite.ts";
import { canLike } from "../../src/model/deck/like/like.ts";
import {
  canPostPublic,
  mayDeletePublic,
  mayEditPublic,
  mustPostPublic,
} from "../../src/model/deck/public-comment/access.ts";
import { threadPublic } from "../../src/model/deck/public-comment/view.ts";
import { accessOf, isOpen, readerVariant } from "../../src/model/deck/serving/access-file.ts";
import { deckIdFromHost, deckOrigin } from "../../src/model/deck/serving/origin.ts";
import { signServeToken, verifyServeToken } from "../../src/model/deck/serving/serve-token.ts";
import { DeckAccess } from "../../src/model/deck/serving/type.ts";
import {
  coverOf,
  minutesOf,
  pictureFile,
  slidePicture,
  versionOf,
} from "../../src/model/deck/version/version.ts";
import { slideMapOf as map } from "./slide-map.ts";

const owner = { id: "u1", handle: "hajimism", name: "Hajime" };
const other = { id: "u2", handle: "sato", name: "Sato" };
const KEY = "0123456789abcdefghijklmnop";

describe("access", () => {
  const deck = (
    visibility: DeckRules["visibility"],
    comments: DeckRules["comments"] = "signed-in",
  ): OpeningRules => ({
    ownerId: "u1",
    visibility,
    comments,
    linkKey: KEY,
  });

  it("keeps a team deck to its owner and the team's side of its grants", () => {
    expect(canView(deck("team"), owner, null, null, null)).toBe(true);
    expect(canView(deck("team"), other, "view", "team", null)).toBe(true);
    expect(canView(deck("team"), other, "comment", "guest", null)).toBe(false);
    expect(canView(deck("team"), other, null, null, null)).toBe(false);
    expect(canView(deck("team"), null, null, null, null)).toBe(false);
  });

  it("keeps a private deck to its owner and grants, on either side", () => {
    expect(canView(deck("private"), owner, null, null, null)).toBe(true);
    expect(canView(deck("private"), other, null, null, null)).toBe(false);
    expect(canView(deck("private"), null, null, null, null)).toBe(false);
    expect(canView(deck("private"), other, "view", "guest", null)).toBe(true);
    expect(canView(deck("private"), other, "view", "team", null)).toBe(true);
    expect(canComment(deck("private"), other, "view")).toBe(false);
    expect(canComment(deck("private"), other, "comment")).toBe(true);
  });

  it("lets the owner and those granted comment write review threads, whatever the policy", () => {
    expect(canView(deck("public"), other, null, null, null)).toBe(true);
    expect(canComment(deck("link", "signed-in"), null, null)).toBe(false);
    expect(canComment(deck("link", "signed-in"), other, null)).toBe(false);
    expect(canComment(deck("public", "off"), other, "comment")).toBe(true);
    expect(canComment(deck("public", "off"), owner, null)).toBe(true);
  });

  it("opens a link deck to anyone holding its key, and to its grants without it", () => {
    expect(canView(deck("link"), null, null, null, KEY)).toBe(true);
    expect(canView(deck("link"), other, null, null, KEY)).toBe(true);
    expect(canView(deck("link"), null, null, null, null)).toBe(false);
    expect(canView(deck("link"), null, null, null, `${KEY.slice(1)}x`)).toBe(false);
    expect(canView(deck("link"), null, null, null, KEY.slice(1))).toBe(false);
    expect(canView({ ...deck("link"), linkKey: null }, null, null, null, "")).toBe(false);
    expect(canView(deck("link"), owner, null, null, null)).toBe(true);
    expect(canView(deck("link"), other, "view", "guest", null)).toBe(true);
  });

  it("opens no other visibility by the key a deck kept from being link", () => {
    expect(canView(deck("private"), null, null, null, KEY)).toBe(false);
    expect(canView(deck("team"), other, "view", "guest", KEY)).toBe(false);
    expect(standingOn(deck("private"), other, [], KEY).opens).toBe(false);
  });

  it("lets a signed-in account like a talk anyone may open, once", () => {
    expect(canLike(deck("public"), other)).toBe(true);
    expect(canLike(deck("link"), owner)).toBe(true);
    expect(canLike(deck("link"), null)).toBe(false);
    expect(canLike(deck("private"), owner)).toBe(false);
    expect(canLike(deck("team"), owner)).toBe(false);
  });

  it("puts the owner on the team's side, a grantee where the grant says, and anyone else with the guests", () => {
    expect(sideOf(deck("private"), owner, null)).toBe("team");
    expect(sideOf(deck("private"), other, "team")).toBe("team");
    expect(sideOf(deck("private"), other, "guest")).toBe("guest");
    expect(sideOf(deck("public"), other, null)).toBe("guest");
    expect(sideOf(deck("public"), null, null)).toBe("guest");
  });

  it("sums up a person's grants as whether the deck opens, their role, and their side", () => {
    expect(standingOn(deck("team"), owner, [], null)).toEqual({
      opens: true,
      role: null,
      side: "team",
    });
    expect(
      standingOn(
        deck("team"),
        other,
        [
          { role: "view", side: "guest" },
          { role: "comment", side: "team" },
        ],
        null,
      ),
    ).toEqual({ opens: true, role: "comment", side: "team" });
    expect(standingOn(deck("team"), other, [{ role: "comment", side: "guest" }], null)).toEqual({
      opens: false,
      role: "comment",
      side: "guest",
    });
    expect(standingOn(deck("private"), other, [{ role: "view", side: "guest" }], null)).toEqual({
      opens: true,
      role: "view",
      side: "guest",
    });
    expect(standingOn(deck("public"), null, [], null)).toEqual({
      opens: true,
      role: null,
      side: "guest",
    });
    expect(standingOn(deck("private"), null, [], null).opens).toBe(false);
    expect(standingOn(deck("link"), null, [], KEY)).toEqual({
      opens: true,
      role: null,
      side: "guest",
    });
    expect(standingOn(deck("link"), null, [], null).opens).toBe(false);
  });

  it("lets only the owner manage", () => {
    expect(canManage(deck("public"), owner)).toBe(true);
    expect(canManage(deck("public"), other)).toBe(false);
    expect(canManage(deck("public"), null)).toBe(false);
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

  it("draws every character of an ID as often as every other", () => {
    // Each byte once, in order: 252 to 255 must be drawn again, the rest give each character 7 times.
    let next = 0;
    const draw = vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = next++ % 256;
      }
      return array;
    });
    try {
      const ids = Array.from({ length: 16 }, () => newDeckId().slice(2)).join("");
      const counts = new Map<string, number>();
      for (const char of ids.slice(0, 252)) {
        counts.set(char, (counts.get(char) ?? 0) + 1);
      }
      expect(counts.size).toBe(36);
      expect(new Set(counts.values())).toEqual(new Set([7]));
      expect(ids.slice(252, 256)).toBe("0000");
    } finally {
      draw.mockRestore();
    }
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

  it("reads the c key a deck passes on, and no other", () => {
    expect(readDeckMessage({ type: "dek:key", key: "c" })).toEqual({ type: "dek:key", key: "c" });
    expect(readDeckMessage({ type: "dek:key", key: "x" })).toBeNull();
    expect(readDeckMessage({ type: "dek:key" })).toBeNull();
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

describe("a talk's length", () => {
  it("is the minutes the frontmatter's duration gives, or none", () => {
    expect(minutesOf("12m")).toBe(12);
    expect(minutesOf(undefined)).toBeNull();
  });
});

describe("the slide being read", () => {
  const headings = [
    { slug: "cover", top: -900 },
    { slug: "plan", top: -40 },
    { slug: "end", top: 600 },
  ];

  it("is the last heading at or above the reading line", () => {
    expect(readingSlug(headings, 200)).toBe("plan");
    expect(readingSlug(headings, 600)).toBe("end");
  });

  it("is none while the article is still below the line", () => {
    expect(readingSlug([{ slug: "cover", top: 400 }], 200)).toBeNull();
    expect(readingSlug([], 200)).toBeNull();
  });
});

describe("the version and the script, by who asks", () => {
  const deck = {
    ownerId: "u1",
    visibility: "public" as const,
    comments: "signed-in" as const,
    scriptPublic: false,
    currentVersion: 2,
  };

  it("tells the current version from one gone before it and one the deck never had", () => {
    expect(versionStanding(deck, 2)).toBe("current");
    expect(versionStanding(deck, 1)).toBe("gone");
    expect(versionStanding(deck, 3)).toBe("unknown");
    expect(versionStanding(deck, 0)).toBe("unknown");
    expect(versionStanding(deck, 1.5)).toBe("unknown");
    expect(versionStanding(deck, Number.NaN)).toBe("unknown");
    expect(versionStanding({ currentVersion: null }, 1)).toBe("unknown");
  });

  it("shows the script to anyone once it is public, else to its owner", () => {
    expect(canSeeScript(deck, owner)).toBe(true);
    expect(canSeeScript(deck, other)).toBe(false);
    expect(canSeeScript({ ...deck, scriptPublic: true }, null)).toBe(true);
  });
});

describe("serving without a token", () => {
  const deck = {
    visibility: "public" as const,
    scriptPublic: true,
    embed: false,
    currentVersion: 2,
  };

  it("opens a public deck's current version only", () => {
    const access = accessOf(deck);
    expect(access).toEqual({ visibility: "public", scriptPublic: true, embed: false, current: 2 });
    expect(isOpen(access, 2)).toBe(true);
    expect(isOpen(access, 1)).toBe(false);
    expect(isOpen(accessOf({ ...deck, visibility: "link" }), 2)).toBe(false);
  });

  it("gives readers what is said aloud when the script is public, else the bare slides", () => {
    expect(readerVariant(true)).toBe("public");
    expect(readerVariant(false)).toBe("bare");
  });

  it("reads an access file only in its shape", () => {
    expect(DeckAccess.safeParse(accessOf(deck)).success).toBe(true);
    expect(DeckAccess.safeParse({ ...accessOf(deck), visibility: "everyone" }).success).toBe(false);
    expect(DeckAccess.safeParse({ visibility: "public" }).success).toBe(false);
  });
});

describe("talk paths", () => {
  it("puts a talk under its owner's profile", () => {
    expect(talkPath("hajimism", "intro")).toBe("/@hajimism/intro");
  });

  it("shares a link talk at its path with its key, and any other at its path alone", () => {
    const talk = { slug: "intro", visibility: "link" as const, linkKey: KEY };
    expect(talkHref("hajimism", talk)).toBe(`/@hajimism/intro?key=${KEY}`);
    expect(talkHref("hajimism", { ...talk, visibility: "public" })).toBe("/@hajimism/intro");
    expect(talkHref("hajimism", { ...talk, visibility: "private" })).toBe("/@hajimism/intro");
    expect(talkHref("hajimism", { ...talk, linkKey: null })).toBe("/@hajimism/intro");
  });

  it("puts a key on a path, after any query it has", () => {
    expect(keyed("/i/d_1/2/cover", KEY)).toBe(`/i/d_1/2/cover?key=${KEY}`);
    expect(keyed("/api/decks/d_1/comments?status=all", KEY)).toBe(
      `/api/decks/d_1/comments?status=all&key=${KEY}`,
    );
    expect(keyed("/i/d_1/2/cover", null)).toBe("/i/d_1/2/cover");
  });

  it("puts a link talk's key into the address it was opened at, keeping the rest", () => {
    expect(withLinkKey("https://dek.pub/@hajimism/intro#s-2", KEY)).toBe(
      `https://dek.pub/@hajimism/intro?key=${KEY}#s-2`,
    );
    expect(withLinkKey("https://dek.pub/@hajimism/intro?lang=ja&key=old#c_1", KEY)).toBe(
      `https://dek.pub/@hajimism/intro?lang=ja&key=${KEY}#c_1`,
    );
    expect(withLinkKey(`https://dek.pub/@hajimism/intro?key=${KEY}`, KEY)).toBe(
      `https://dek.pub/@hajimism/intro?key=${KEY}`,
    );
    expect(withLinkKey("https://dek.pub/@hajimism/intro#s-2", null)).toBe(
      "https://dek.pub/@hajimism/intro#s-2",
    );
  });

  it("reads a talk named as @handle/slug, and nothing else", () => {
    expect(talkNamed(" @hajimism/intro ")).toEqual({ segment: "@hajimism", slug: "intro" });
    expect(talkNamed("hajimism/intro")).toBeNull();
    expect(talkNamed("@hajimism/Intro")).toBeNull();
    expect(talkNamed("@hajimism/intro/more")).toBeNull();
  });
});

describe("sitemapOf", () => {
  const talks = [
    { handle: "ann", slug: "new", updatedAt: "2026-11-02T09:00:00.000Z" },
    { handle: "bob", slug: "only", updatedAt: "2026-10-01T09:00:00.000Z" },
    { handle: "ann", slug: "old", updatedAt: "2026-09-01T09:00:00.000Z" },
  ];
  const urls = (xml: string) => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]);

  it("lists the landing and About pages in each language, each with both and x-default", () => {
    const xml = sitemapOf("https://dek.pub", []);
    expect(urls(xml)).toEqual([
      "https://dek.pub/",
      "https://dek.pub/?lang=en",
      "https://dek.pub/about",
      "https://dek.pub/about?lang=en",
    ]);
    const about = xml
      .split("<url>")
      .find((entry) => entry.includes("<loc>https://dek.pub/about?lang=en<"));
    expect(about).toContain(
      '<xhtml:link rel="alternate" hreflang="ja" href="https://dek.pub/about" />',
    );
    expect(about).toContain(
      '<xhtml:link rel="alternate" hreflang="en" href="https://dek.pub/about?lang=en" />',
    );
    expect(about).toContain(
      '<xhtml:link rel="alternate" hreflang="x-default" href="https://dek.pub/about" />',
    );
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset /);
  });

  it("lists each talk, and each profile once, dated by its newest talk", () => {
    const xml = sitemapOf("https://dek.pub", talks);
    expect(urls(xml).slice(4)).toEqual([
      "https://dek.pub/@ann/new",
      "https://dek.pub/@bob/only",
      "https://dek.pub/@ann/old",
      "https://dek.pub/@ann",
      "https://dek.pub/@bob",
    ]);
    expect(xml).toContain(
      "<loc>https://dek.pub/@ann/old</loc>\n    <lastmod>2026-09-01T09:00:00.000Z</lastmod>",
    );
    expect(xml).toContain(
      "<loc>https://dek.pub/@ann</loc>\n    <lastmod>2026-11-02T09:00:00.000Z</lastmod>",
    );
  });

  it("stops at the bound, keeping the newest talks and the profiles they need", () => {
    expect(urls(sitemapOf("https://dek.pub", talks, 7)).slice(4)).toEqual([
      "https://dek.pub/@ann/new",
      "https://dek.pub/@ann",
    ]);
  });
});

describe("grants", () => {
  it("names a person by handle, with or without @, or by email address", () => {
    expect(granteeOf("@Sato")).toEqual({ handle: "sato" });
    expect(granteeOf("sato")).toEqual({ handle: "sato" });
    expect(granteeOf("Sato@Example.com")).toEqual({ email: "sato@example.com" });
    expect(granteeOf("not a name")).toBeNull();
  });

  it("counts the grant that allows more", () => {
    expect(strongestRole(["view", "comment"])).toBe("comment");
    expect(strongestRole(["view"])).toBe("view");
    expect(strongestRole([])).toBeNull();
  });

  it("counts the side that sees more", () => {
    expect(widestSide(["guest", "team"])).toBe("team");
    expect(widestSide(["guest"])).toBe("guest");
    expect(widestSide([])).toBeNull();
  });
});

describe("version pictures", () => {
  const version = (files: Record<string, string>, shots: Record<string, string>) =>
    versionOf({
      deckId: "d_x",
      n: 4,
      dekVersion: "1.0.0",
      slideMap: JSON.stringify(
        map([
          ["intro", []],
          ["end", []],
        ]),
      ),
      lintErrors: 0,
      lintWarnings: 0,
      bytes: 1,
      message: null,
      files: JSON.stringify(files),
      shots: JSON.stringify(shots),
      changed: JSON.stringify(["intro"]),
      createdAt: "2026-11-01T00:00:00.000Z",
    });

  it("reads each JSON column back in its shape", () => {
    const read = version({ full: "a" }, { end: "b" });
    expect(read.slideMap.slides.map((slide) => slide.slug)).toEqual(["intro", "end"]);
    expect(read.changed).toEqual(["intro"]);
  });

  it("stands the cover for the version, else the first slide that has a picture", () => {
    expect(coverOf("d_x", version({ cover: "c" }, { intro: "a" }))).toBe("/i/d_x/4/cover");
    expect(coverOf("d_x", version({}, { end: "b" }))).toBe("/i/d_x/4/s-end");
    expect(coverOf("d_x", version({}, {}))).toBeNull();
  });

  it("finds the file a picture's name stands for", () => {
    expect(pictureFile("cover")).toBe("cover.png");
    expect(pictureFile(slidePicture("d_x", 4, "intro").split("/").at(-1) ?? "")).toBe(
      "shots/intro.png",
    );
    expect(pictureFile("full")).toBeNull();
  });
});

describe("publishing", () => {
  const rename = (from: string, to: string, at = "2026-11-01T00:00:00Z") => ({ from, to, at });

  it("keeps each new rename once", () => {
    expect(
      newRenames([rename("a", "b"), rename("a", "b"), rename("b", "c")], [rename("b", "c")]),
    ).toEqual([rename("a", "b")]);
  });

  it("refuses a form with no manifest, or one that is not JSON", () => {
    expect(() => readManifest("{")).toThrow("not JSON");
    expect(() => readManifest(undefined)).toThrow("no manifest");
  });

  it("refuses a title, a description or a message longer than a page can show", () => {
    const manifest = {
      protocol: PROTOCOL_VERSION,
      dekVersion: "0.9.0",
      deck: "why-dek",
      title: "Why dek",
      base: null,
      slideMap: { deck: "why-dek", out: "why-dek.html", slides: [] },
      lint: { errors: 0, warnings: 0 },
      renames: [],
      files: {},
      shots: {},
    };
    const read = (extra: object) => () => readManifest(JSON.stringify({ ...manifest, ...extra }));
    expect(read({ title: "x".repeat(500), description: "x".repeat(2000) })).not.toThrow();
    expect(read({ message: "x".repeat(2000) })).not.toThrow();
    expect(read({ title: "x".repeat(501) })).toThrow("title: ");
    expect(read({ description: "x".repeat(2001) })).toThrow("description: ");
    expect(read({ message: "x".repeat(2001) })).toThrow("message: ");
    expect(CreateDeckRequest.safeParse({ slug: "why-dek", title: "x".repeat(501) }).success).toBe(
      false,
    );
  });
});

describe("invitationMail", () => {
  const base = {
    to: "sato@example.com",
    inviter: "Hajime",
    title: "Why dek",
    url: "https://dek.pub/@hajimism/why-dek",
  };

  it("says who shared which talk, and what the grant lets them do", () => {
    const mail = invitationMail({ ...base, role: "comment", byEmail: false });
    expect(mail.to).toBe("sato@example.com");
    expect(mail.subject).toBe("Hajime shared “Why dek” with you");
    expect(mail.text).toContain("to read and comment on");
    expect(mail.text).toContain(base.url);
    expect(invitationMail({ ...base, role: "view", byEmail: false }).text).toContain("to read.");
  });

  it("tells an address with no account yet to sign in with it", () => {
    const mail = invitationMail({ ...base, role: "view", byEmail: true });
    expect(mail.text).toContain("sign in with sato@example.com");
    expect(invitationMail({ ...base, role: "view", byEmail: false }).text).not.toContain(
      "sign in with",
    );
  });
});

describe("link keys", () => {
  it("are 26 of the ID alphabet's characters, over 128 bits, and never the same twice", () => {
    const keys = Array.from({ length: 32 }, newLinkKey);
    expect(keys.every((key) => /^[0-9a-z]{26}$/.test(key))).toBe(true);
    expect(26 * Math.log2(36)).toBeGreaterThan(128);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("match only the very key, and never when the deck has none", () => {
    expect(sameKey(KEY, KEY)).toBe(true);
    expect(sameKey(KEY, `${KEY.slice(0, -1)}q`)).toBe(false);
    expect(sameKey(KEY, `${KEY}0`)).toBe(false);
    expect(sameKey(KEY, null)).toBe(false);
    expect(sameKey(KEY, undefined)).toBe(false);
    expect(sameKey(null, "")).toBe(false);
    expect(sameKey("", "")).toBe(false);
  });

  it("are made the first time a deck becomes link, kept after, and replaced when asked", () => {
    const made = sharePatch({ linkKey: null }, { visibility: "link" });
    expect(made.visibility).toBe("link");
    expect(made.linkKey).toMatch(/^[0-9a-z]{26}$/);
    expect(sharePatch({ linkKey: KEY }, { visibility: "link" })).toEqual({ visibility: "link" });
    expect(sharePatch({ linkKey: null }, { visibility: "private" })).toEqual({
      visibility: "private",
    });
    expect(sharePatch({ linkKey: KEY }, { scriptPublic: true })).toEqual({ scriptPublic: true });
    const renewed = sharePatch({ linkKey: KEY }, { newLink: true });
    expect(Object.keys(renewed)).toEqual(["linkKey"]);
    expect(renewed.linkKey).toMatch(/^[0-9a-z]{26}$/);
    expect(renewed.linkKey).not.toBe(KEY);
  });
});

describe("public comments", () => {
  const open = { ownerId: "u1", visibility: "link" as const, comments: "signed-in" as const };
  const mine = { authorId: "u2" };

  it("are on a talk that opens without a grant, and not on a private one", () => {
    expect(opensWithoutGrant(open)).toBe(true);
    expect(opensWithoutGrant({ ...open, visibility: "public" })).toBe(true);
    expect(opensWithoutGrant({ ...open, visibility: "private" })).toBe(false);
    expect(opensWithoutGrant({ ...open, visibility: "team" })).toBe(false);
  });

  it("may be posted as the policy says: by anyone signed in, or by no one", () => {
    expect(canPostPublic(open, { id: "u2" })).toBe(true);
    expect(canPostPublic({ ...open, visibility: "public" }, { id: "u2" })).toBe(true);
    expect(canPostPublic({ ...open, comments: "off" }, { id: "u1" })).toBe(false);
    expect(canPostPublic({ ...open, visibility: "private" }, { id: "u1" })).toBe(false);
  });

  it("refuse a poster with no_comments, asking someone signed out to sign in", () => {
    const refusal = (deck: DeckRules, person: { id: string } | null) => {
      try {
        mustPostPublic(deck, person);
      } catch (error) {
        return error;
      }
    };
    expect(refusal(open, { id: "u2" })).toBeUndefined();
    expect(refusal(open, null)).toMatchObject({
      status: 403,
      code: "no_comments",
      hint: "sign in to comment",
    });
    expect(refusal({ ...open, comments: "off" }, null)).toMatchObject({ hint: undefined });
    expect(refusal({ ...open, comments: "off" }, { id: "u2" })).toMatchObject({
      code: "no_comments",
      hint: undefined,
    });
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
