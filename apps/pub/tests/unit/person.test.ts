import { describe, expect, it } from "vitest";
import {
  formatUserCode,
  isCompleteUserCode,
  normalizeUserCode,
} from "../../src/model/person/feature/connect-cli/device-code.ts";
import { rssDate, talkFeed, xmlText } from "../../src/model/person/feature/profile/rss.ts";
import { safeNext } from "../../src/model/person/next-path.ts";
import { meOf, profileOf, selfOf } from "../../src/model/person/person.ts";
import { handleOf, profilePath } from "../../src/model/person/profile-path.ts";
import { Account } from "../../src/model/person/type.ts";

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

describe("Account", () => {
  const user = {
    id: "u1",
    name: "Hajime",
    email: "h@example.com",
    emailVerified: true,
    image: "https://example.com/a.png",
    handle: "hajimism",
    createdAt: new Date(0),
  };

  it("reads a Better Auth user as a Person, leaving out what dek.pub does not use", () => {
    expect(Account.parse(user)).toEqual({
      id: "u1",
      handle: "hajimism",
      name: "Hajime",
      image: "https://example.com/a.png",
      email: "h@example.com",
      emailVerified: true,
    });
  });

  it("stands the ID in for a missing handle, and takes an address as unverified unless it says so", () => {
    const person = Account.parse({ id: "u2", name: "Sato", email: "s@example.com" });
    expect(person.handle).toBe("u2");
    expect(person.image).toBeNull();
    expect(person.emailVerified).toBe(false);
  });

  it("refuses a record that is not an account", () => {
    expect(Account.safeParse({ id: "u1", name: "Hajime" }).success).toBe(false);
  });

  it("shows pages and other people no email address", () => {
    const person = Account.parse(user);
    expect(selfOf(person)).toEqual({
      id: "u1",
      handle: "hajimism",
      name: "Hajime",
      image: user.image,
    });
    expect(profileOf(person)).toEqual({ handle: "hajimism", name: "Hajime", image: user.image });
    expect(meOf(person)).toEqual({ id: "u1", handle: "hajimism", name: "Hajime" });
  });
});

describe("profilePath", () => {
  it("puts a person at /@handle", () => {
    expect(profilePath("hajimism")).toBe("/@hajimism");
  });
});

describe("talkFeed", () => {
  const card = {
    slug: "intro",
    title: "Intro & <more>",
    event: null,
    date: "2026-11-01",
    slides: 3,
    visibility: "public" as const,
    picture: "/i/d_x/1/cover",
    owner: { handle: "hajimism", name: "Hajime", image: null },
    updatedAt: "2026-11-02T00:00:00.000Z",
  };

  it("links every item absolutely, and escapes what it says", () => {
    const xml = talkFeed(card.owner, [card], "https://dek.pub");
    expect(xml).toContain("<link>https://dek.pub/@hajimism/intro</link>");
    expect(xml).toContain("<title>Intro &amp; &lt;more&gt;</title>");
    expect(xml).toContain('<enclosure url="https://dek.pub/i/d_x/1/cover"');
    expect(xml).toContain('<atom:link href="https://dek.pub/@hajimism/rss"');
    expect(xml).toContain("<pubDate>Sun, 01 Nov 2026 00:00:00 GMT</pubDate>");
  });
});
