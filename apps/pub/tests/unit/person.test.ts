import { describe, expect, it, vi } from "vitest";
import {
  formatUserCode,
  isCompleteUserCode,
  normalizeUserCode,
} from "../../src/model/person/feature/connect-cli/device-code.ts";
import {
  pageCount,
  profileHref,
  profilePage,
} from "../../src/model/person/feature/profile/paging.ts";
import { rssDate, talkFeed } from "../../src/model/person/feature/profile/rss.ts";
import { profileView } from "../../src/model/person/feature/profile/view.ts";
import { signInMail } from "../../src/model/person/feature/sign-in/mail.ts";
import { safeNext } from "../../src/model/person/next-path.ts";
import { authorOf, meOf, profileOf, readAccount, selfOf } from "../../src/model/person/person.ts";
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

describe("authorOf", () => {
  it("names the author by name and handle, and one whose account is gone as someone", () => {
    const people = new Map([
      ["u1", { id: "u1", handle: "demo", name: "Demo", image: null } as never],
    ]);
    expect(authorOf({ authorId: "u1" }, people)).toEqual({ name: "Demo", handle: "demo" });
    expect(authorOf({ authorId: "u9" }, people)).toEqual({ name: "someone", handle: "u9" });
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

  it("reads a record it cannot as no one, and says so, rather than failing the request", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(readAccount({ id: "u1", name: "Hajime" })).toBeNull();
    expect(error).toHaveBeenCalledOnce();
    expect(readAccount(user)?.id).toBe("u1");
    error.mockRestore();
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

describe("signInMail", () => {
  it("carries the link and says what to do with it", () => {
    const mail = signInMail(
      "sato@example.com",
      "https://dek.pub/api/auth/magic-link/verify?token=t",
    );
    expect(mail.to).toBe("sato@example.com");
    expect(mail.subject).toBe("Sign in to dek.pub");
    expect(mail.text).toContain("https://dek.pub/api/auth/magic-link/verify?token=t");
    expect(mail.text).toContain("15 minutes");
  });
});

describe("profileView", () => {
  it("is the timeline only when the address asks for it, else the gallery", () => {
    expect(profileView("timeline")).toBe("timeline");
    expect(profileView("gallery")).toBe("gallery");
    expect(profileView(undefined)).toBe("gallery");
    expect(profileView("grid")).toBe("gallery");
  });
});

describe("profile pages", () => {
  it("reads ?page= as a whole number from 1, and anything else as the first page", () => {
    expect(profilePage("3")).toBe(3);
    expect(profilePage(undefined)).toBe(1);
    for (const asked of ["0", "-2", "2.5", "02", "two", ""]) {
      expect(profilePage(asked)).toBe(1);
    }
  });

  it("counts the pages 24 talks a page fill, and one for none", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(24)).toBe(1);
    expect(pageCount(25)).toBe(2);
  });

  it("addresses a page in its view, leaving out what is the default", () => {
    expect(profileHref("demo", "gallery", 1)).toBe("/@demo");
    expect(profileHref("demo", "timeline", 1)).toBe("/@demo?view=timeline");
    expect(profileHref("demo", "gallery", 3)).toBe("/@demo?page=3");
    expect(profileHref("demo", "timeline", 2)).toBe("/@demo?view=timeline&page=2");
  });
});
