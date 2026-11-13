import { describe, expect, it, vi } from "vitest";
import { DeckId } from "../../../../src/pub/protocol.ts";
import { newDeckId } from "../../src/common/ids.ts";
import {
  canComment,
  canManage,
  canSeeScript,
  canView,
  type DeckRules,
  mayReadVersion,
  shownVersion,
  sideOf,
} from "../../src/model/deck/access.ts";
import { talkNamed, talkPath } from "../../src/model/deck/deck.ts";
import { newRenames, readManifest } from "../../src/model/deck/feature/publish/manifest.ts";
import { slideChanges } from "../../src/model/deck/feature/publish/slide-diff.ts";
import {
  boxToPercent,
  readDeckMessage,
  withSlide,
} from "../../src/model/deck/feature/talk/embed.ts";
import {
  granteeOf,
  strongestRole,
  waitingGrants,
  widestSide,
} from "../../src/model/deck/grant/grant.ts";
import { invitationMail } from "../../src/model/deck/grant/invite.ts";
import { accessOf, isOpen, readerVariant } from "../../src/model/deck/serving/access-file.ts";
import { deckIdFromHost, deckOrigin } from "../../src/model/deck/serving/origin.ts";
import { signServeToken, verifyServeToken } from "../../src/model/deck/serving/serve-token.ts";
import { DeckAccess } from "../../src/model/deck/serving/type.ts";
import {
  coverOf,
  pictureFile,
  slidePicture,
  summaryOf,
  versionOf,
} from "../../src/model/deck/version/version.ts";
import { handleFromEmail, isHandle } from "../../src/model/person/handle.ts";
import { slideMapOf as map } from "./slide-map.ts";

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

  it("puts the owner on the team's side, a grantee where the grant says, and anyone else with the client", () => {
    expect(sideOf(deck("private"), owner, null)).toBe("team");
    expect(sideOf(deck("private"), other, "team")).toBe("team");
    expect(sideOf(deck("private"), other, "client")).toBe("client");
    expect(sideOf(deck("public"), other, null)).toBe("client");
    expect(sideOf(deck("public"), null, null)).toBe("client");
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

  it("makes handles that fit a URL", () => {
    expect(handleFromEmail("Sato.Taro+test@example.com")).toBe("sato-taro-test");
    expect(isHandle("sato-taro")).toBe(true);
    expect(isHandle("-sato")).toBe(false);
    expect(isHandle("Sato")).toBe(false);
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

describe("versions and the script, by who asks", () => {
  const deck = {
    ownerId: "u1",
    visibility: "public" as const,
    comments: "signed-in" as const,
    scriptPublic: false,
    currentVersion: 2,
    latestVersion: 3,
  };

  it("shows readers the current version, and the owner the newest when none is current", () => {
    expect(shownVersion(deck, other)).toBe(2);
    expect(shownVersion(deck, owner)).toBe(2);
    expect(shownVersion({ ...deck, currentVersion: null }, owner)).toBe(3);
    expect(shownVersion({ ...deck, currentVersion: null }, other)).toBeNull();
  });

  it("lets readers read the current version only, and the owner any uploaded", () => {
    expect(mayReadVersion(deck, other, 2)).toBe(true);
    expect(mayReadVersion(deck, other, 1)).toBe(false);
    expect(mayReadVersion(deck, null, 3)).toBe(false);
    expect(mayReadVersion(deck, owner, 3)).toBe(true);
    expect(mayReadVersion(deck, owner, 4)).toBe(false);
    expect(mayReadVersion(deck, owner, 0)).toBe(false);
    expect(mayReadVersion(deck, owner, Number.NaN)).toBe(false);
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

  it("reads a talk named as @handle/slug, and nothing else", () => {
    expect(talkNamed(" @hajimism/intro ")).toEqual({ segment: "@hajimism", slug: "intro" });
    expect(talkNamed("hajimism/intro")).toBeNull();
    expect(talkNamed("@hajimism/Intro")).toBeNull();
    expect(talkNamed("@hajimism/intro/more")).toBeNull();
  });
});

describe("grants", () => {
  it("names a person by handle, with or without @, or by email address", () => {
    expect(granteeOf("@Sato")).toEqual({ handle: "sato" });
    expect(granteeOf("sato")).toEqual({ handle: "sato" });
    expect(granteeOf("Sato@Example.com")).toEqual({ email: "sato@example.com" });
    expect(granteeOf("not a name")).toBeNull();
  });

  it("claims a grant by address for the account, unless it holds one by handle on that deck", () => {
    const row = (id: string, deckId: string, userId: string | null) => ({ id, deckId, userId });
    expect(
      waitingGrants(
        [
          row("g1", "d_a", null),
          row("g2", "d_b", null),
          row("g3", "d_b", "u1"),
          row("g4", "d_c", "u1"),
        ],
        "u1",
      ).map((grant) => grant.id),
    ).toEqual(["g1"]);
  });

  it("counts the grant that allows more", () => {
    expect(strongestRole(["view", "comment"])).toBe("comment");
    expect(strongestRole(["view"])).toBe("view");
    expect(strongestRole([])).toBeNull();
  });

  it("counts the side that sees more", () => {
    expect(widestSide(["client", "team"])).toBe("team");
    expect(widestSide(["client"])).toBe("client");
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
    expect(summaryOf(read)).toMatchObject({
      n: 4,
      lint: { errors: 0, warnings: 0 },
      changed: ["intro"],
    });
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
