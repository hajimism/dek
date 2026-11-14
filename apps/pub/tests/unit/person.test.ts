import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import type { Context } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import authConfig from "../../auth.ts";
import {
  checkKey,
  keysOf,
  makeKey,
  revokeKeyOf,
  revokeKeysOf,
} from "../../src/model/person/api-key.server.ts";
import { keyName, MAX_KEY_NAME_LENGTH } from "../../src/model/person/api-key.ts";
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
import { NOT_INVITED, signInFailure } from "../../src/model/person/feature/sign-in/failure.ts";
import { signInMail } from "../../src/model/person/feature/sign-in/mail.ts";
import {
  handleProblem,
  isReservedHandle,
  normalizeHandle,
  suggestHandle,
} from "../../src/model/person/handle.ts";
import { mayJoin, readInvited, readNewcomer } from "../../src/model/person/invited.ts";
import {
  firstLinks,
  linkFace,
  MAX_LINK_LENGTH,
  MAX_LINKS,
  readLink,
  readLinks,
} from "../../src/model/person/link.ts";
import { MAX_NAME_LENGTH, readName } from "../../src/model/person/name.ts";
import { namesOperator, readOperators } from "../../src/model/person/operator.ts";
import {
  authorOf,
  hasHandle,
  meOf,
  profileOf,
  readAccount,
  selfOf,
} from "../../src/model/person/person.ts";
import { handleOf, profilePath } from "../../src/model/person/profile-path.ts";
import { safeNext, signInHref, welcomeHref } from "../../src/model/person/sign-in-path.ts";
import { Account } from "../../src/model/person/type.ts";

// auth.ts as it is, with dek.pub's own stores, which need Void's D1, put aside: who may join is
// asked of a stand-in that notes the question, no grants are claimed, no mail goes out, and the
// links an account starts with are only noted.
const invitation = vi.hoisted(() => ({
  asked: [] as unknown[],
  invited: true,
}));
vi.mock("../../src/model/person/feature/sign-in/invitation.server.ts", () => ({
  mayMakeAccount: async (newcomer: unknown) => {
    invitation.asked.push(newcomer);
    return invitation.invited;
  },
}));
vi.mock("../../src/model/person/feature/sign-in/claim.server.ts", () => ({
  claimOnSignIn: async () => {},
}));
vi.mock("../../src/model/person/feature/sign-in/link.server.ts", () => ({
  sendSignInLink: async () => {},
}));
const seeding = vi.hoisted(() => ({
  seeded: [] as unknown[],
  seed: async (_user: unknown): Promise<void> => {},
}));
vi.mock("../../src/model/person/link.server.ts", () => ({
  seedLinks: (user: unknown) => {
    seeding.seeded.push(user);
    return seeding.seed(user);
  },
}));

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

describe("signInHref", () => {
  it("names the page to come back to, unless that is the front page or the sign-in page", () => {
    expect(signInHref("/@demo/why-dek?x=1#intro")).toBe(
      "/signin?next=%2F%40demo%2Fwhy-dek%3Fx%3D1%23intro",
    );
    expect(signInHref("/device?user_code=ABCD-EFGH")).toBe(
      "/signin?next=%2Fdevice%3Fuser_code%3DABCD-EFGH",
    );
    expect(signInHref("/")).toBe("/signin");
    expect(signInHref("/signin?next=%2Fx")).toBe("/signin");
    expect(signInHref()).toBe("/signin");
  });
});

describe("welcomeHref", () => {
  it("names the page to come back to once a handle is chosen, unless that is the front page", () => {
    expect(welcomeHref("/device?user_code=ABCD-EFGH")).toBe(
      "/welcome?next=%2Fdevice%3Fuser_code%3DABCD-EFGH",
    );
    expect(welcomeHref("/")).toBe("/welcome");
    expect(welcomeHref("/welcome?next=%2Fx")).toBe("/welcome");
  });
});

describe("handles", () => {
  it("are lowercase letters, digits and single hyphens, up to 39, as GitHub logins are", () => {
    for (const handle of ["hajimism", "a", "sato-k", "x9", "a".repeat(39)]) {
      expect(handleProblem(handle)).toBeNull();
    }
    for (const handle of ["", "-sato", "sato-", "sa--to", "Sato", "sato.k", "a".repeat(40)]) {
      expect(handleProblem(handle)).toBe("invalid");
    }
  });

  it("keep the names a person could pose as dek.pub with for no one", () => {
    for (const handle of ["dek", "dekpub", "dek-pub", "admin", "support", "official", "welcome"]) {
      expect(isReservedHandle(handle)).toBe(true);
      expect(handleProblem(handle)).toBe("reserved");
    }
    expect(isReservedHandle("dek-fan")).toBe(false);
  });

  it("are read as typed, but for case and the spaces around", () => {
    expect(normalizeHandle(" Octo-Cat ")).toBe("octo-cat");
  });
});

describe("suggestHandle", () => {
  it("is the GitHub login when the account came from GitHub", () => {
    expect(suggestHandle({ githubLogin: "Octo-Cat", email: "sato@example.com" })).toBe("octo-cat");
  });

  it("is the address's local part, made a handle, for any other account", () => {
    expect(suggestHandle({ githubLogin: null, email: "Sato.K+talks@example.com" })).toBe(
      "sato-k-talks",
    );
    expect(suggestHandle({ githubLogin: null, email: "___@example.com" })).toBeNull();
  });

  it("is the address's when the login is no handle, and none when neither is", () => {
    expect(suggestHandle({ githubLogin: "admin", email: "sato@example.com" })).toBe("sato");
    expect(suggestHandle({ githubLogin: "admin", email: "support@example.com" })).toBeNull();
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

  it("reads a Better Auth user, leaving out what dek.pub does not use", () => {
    expect(Account.parse({ ...user, githubLogin: "Hajimism" })).toEqual({
      id: "u1",
      handle: "hajimism",
      name: "Hajime",
      image: "https://example.com/a.png",
      email: "h@example.com",
      emailVerified: true,
      githubLogin: "Hajimism",
    });
  });

  it("reads an account with no handle chosen yet as having none, and takes an address as unverified unless it says so", () => {
    const account = Account.parse({ id: "u2", name: "Sato", email: "s@example.com", handle: null });
    expect(account.handle).toBeNull();
    expect(account.githubLogin).toBeNull();
    expect(account.image).toBeNull();
    expect(account.emailVerified).toBe(false);
    expect(hasHandle(account)).toBe(false);
    expect(selfOf(account).handle).toBeNull();
    expect(hasHandle(Account.parse(user))).toBe(true);
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
    if (!hasHandle(person)) {
      throw new Error("the account has a handle");
    }
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

describe("readInvited", () => {
  it("reads addresses and GitHub logins, split by commas or whitespace, trimmed and in lowercase", () => {
    const invited = readInvited(" Sato@Example.com,@Octo-Cat\n  kato@example.com ,, @hajimism\t");
    expect(invited.anyone).toBe(false);
    expect([...invited.emails]).toEqual(["sato@example.com", "kato@example.com"]);
    expect([...invited.logins]).toEqual(["octo-cat", "hajimism"]);
  });

  it("opens sign-up to anyone only when `*` is the whole list", () => {
    expect(readInvited(" * ").anyone).toBe(true);
    const mixed = readInvited("*, sato@example.com");
    expect(mixed.anyone).toBe(false);
    expect([...mixed.emails]).toEqual(["sato@example.com"]);
  });

  it("invites nobody from an empty setting, and leaves out what is neither an address nor a login", () => {
    for (const setting of ["", "   ", "@, sato, *@*x"]) {
      const invited = readInvited(setting);
      expect(invited.anyone).toBe(false);
      expect(invited.emails.size + invited.logins.size).toBe(0);
    }
  });
});

describe("readOperators", () => {
  it("reads addresses, split by commas or whitespace, in lowercase", () => {
    expect([...readOperators(" Hajime@Example.com,sato@example.com\n  ,, ")]).toEqual([
      "hajime@example.com",
      "sato@example.com",
    ]);
  });

  it("names no operator from an empty setting, nor by handle, GitHub login, or `*`", () => {
    for (const setting of ["", "   ", "hajimism, @sato, *, *@example.com, @octo-cat"]) {
      expect(readOperators(setting).size).toBe(0);
    }
  });
});

describe("namesOperator", () => {
  const operators = readOperators("hajime@example.com");
  const account = { email: "Hajime@example.com", emailVerified: true };

  it("names the account whose verified address is listed, whatever its case", () => {
    expect(namesOperator(operators, account)).toBe(true);
    expect(namesOperator(operators, { ...account, email: "sato@example.com" })).toBe(false);
  });

  it("never names an account whose address is not verified", () => {
    expect(namesOperator(operators, { ...account, emailVerified: false })).toBe(false);
  });
});

describe("mayJoin", () => {
  const nobodyWaits = vi.fn(async () => false);
  const newcomer = { email: "sato@example.com", emailVerified: true, githubLogin: null };
  const none = readOperators("");

  it("lets anyone in when the list is `*`, a verified address or not", async () => {
    const anyone = readInvited("*");
    expect(await mayJoin(anyone, none, { ...newcomer, emailVerified: false }, nobodyWaits)).toBe(
      true,
    );
  });

  it("lets in a verified address on the list, whatever its case", async () => {
    const invited = readInvited("Sato@Example.com");
    expect(
      await mayJoin(invited, none, { ...newcomer, email: "SATO@example.com" }, nobodyWaits),
    ).toBe(true);
    expect(
      await mayJoin(invited, none, { ...newcomer, email: "kato@example.com" }, nobodyWaits),
    ).toBe(false);
  });

  it("never counts an address that is not verified, on the list or with a share waiting", async () => {
    const waits = vi.fn(async () => true);
    const unverified = { ...newcomer, emailVerified: false };
    expect(await mayJoin(readInvited("sato@example.com"), none, unverified, waits)).toBe(false);
    expect(await mayJoin(readInvited(""), none, unverified, waits)).toBe(false);
    expect(waits).not.toHaveBeenCalled();
  });

  it("lets in a GitHub account on the list as `@login`, whatever its address", async () => {
    const invited = readInvited("@octo-cat");
    const github = { email: "o@example.com", emailVerified: false, githubLogin: "Octo-Cat" };
    expect(await mayJoin(invited, none, github, nobodyWaits)).toBe(true);
    expect(await mayJoin(invited, none, { ...github, githubLogin: "octo-dog" }, nobodyWaits)).toBe(
      false,
    );
    expect(await mayJoin(readInvited("octo-cat@example.com"), none, github, nobodyWaits)).toBe(
      false,
    );
  });

  it("lets in a verified address a share waits for, asking by the address in lowercase", async () => {
    const waits = vi.fn(async (email: string) => email === "sato@example.com");
    expect(
      await mayJoin(readInvited(""), none, { ...newcomer, email: "Sato@example.com" }, waits),
    ).toBe(true);
    expect(waits).toHaveBeenCalledWith("sato@example.com");
    expect(
      await mayJoin(readInvited(""), none, { ...newcomer, email: "kato@example.com" }, waits),
    ).toBe(false);
  });

  it("lets in a verified address DEK_PUB_OPERATORS lists, though nobody invited it", async () => {
    const operators = readOperators("Sato@example.com");
    expect(await mayJoin(readInvited(""), operators, newcomer, nobodyWaits)).toBe(true);
    expect(
      await mayJoin(readInvited(""), operators, { ...newcomer, emailVerified: false }, nobodyWaits),
    ).toBe(false);
    const github = { email: "o@example.com", emailVerified: true, githubLogin: "sato" };
    expect(await mayJoin(readInvited(""), readOperators("@sato"), github, nobodyWaits)).toBe(false);
  });
});

describe("readNewcomer", () => {
  it("reads who Better Auth is about to make an account for, with the login of a GitHub profile", () => {
    expect(
      readNewcomer({
        user: {
          email: "o@example.com",
          emailVerified: true,
          name: "Octo",
          githubLogin: "Octo-Cat",
        },
        source: {
          method: "oauth",
          action: "create-user",
          oauth: { providerId: "github", profile: { login: "Octo-Cat", id: 1 } },
        },
      }),
    ).toEqual({ email: "o@example.com", emailVerified: true, githubLogin: "Octo-Cat" });
  });

  it("gives no login for any other way in, and takes an address as unverified unless it says so", () => {
    expect(
      readNewcomer({
        user: { email: "s@example.com" },
        source: { method: "magic-link", action: "create-user" },
      }),
    ).toEqual({ email: "s@example.com", emailVerified: false, githubLogin: null });
    expect(
      readNewcomer({
        user: { email: "s@example.com", emailVerified: true },
        source: {
          method: "oauth",
          action: "create-user",
          oauth: { providerId: "google", profile: { login: "x" } },
        },
      })?.githubLogin,
    ).toBeNull();
  });

  it("refuses what has no address, and says so", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(readNewcomer({ user: {}, source: { method: "oauth" } })).toBeNull();
    expect(readNewcomer(null)).toBeNull();
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });

  it("refuses an account to be made with a login that is not its GitHub profile's", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const github = { providerId: "github", profile: { login: "Octo-Cat" } };
    const user = { email: "o@example.com", emailVerified: true };
    const named = (githubLogin: string | null, oauth?: object) =>
      readNewcomer({ user: { ...user, githubLogin }, source: { method: "oauth", oauth } });
    expect(named("Octo-Cat", { providerId: "github" })).toBeNull();
    expect(named("octo-dog", github)).toBeNull();
    expect(named(null, github)).toBeNull();
    expect(named("Octo-Cat", { providerId: "google", profile: { login: "Octo-Cat" } })).toBeNull();
    expect(named("Octo-Cat")).toBeNull();
    expect(error).toHaveBeenCalledTimes(5);
    error.mockRestore();
  });
});

describe("signInFailure", () => {
  it("tells a refused sign-up from a link that no longer works and from anything else", () => {
    expect(signInFailure(NOT_INVITED)).toBe("not-invited");
    expect(signInFailure("INVALID_TOKEN")).toBe("link-failed");
    expect(signInFailure("access_denied")).toBe("failed");
    expect(signInFailure("")).toBe("failed");
    expect(signInFailure(undefined)).toBeNull();
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

describe("readLink", () => {
  it("reads an https address as the URL parser writes it", () => {
    expect(readLink(" https://GitHub.com/hajimism ")).toEqual({
      ok: true,
      url: "https://github.com/hajimism",
    });
    expect(readLink("https://example.com")).toEqual({ ok: true, url: "https://example.com/" });
    expect(readLink("https://example.com:443/a?b=1#c")).toEqual({
      ok: true,
      url: "https://example.com/a?b=1#c",
    });
  });

  it("takes an address typed without its scheme as https", () => {
    expect(readLink("zenn.dev/hajimism")).toEqual({ ok: true, url: "https://zenn.dev/hajimism" });
    expect(readLink("example.com:8443/me")).toEqual({
      ok: true,
      url: "https://example.com:8443/me",
    });
  });

  it("refuses http and every scheme but https", () => {
    for (const input of ["http://example.com", "javascript:alert(1)", "ftp://example.com/x"]) {
      expect(readLink(input)).toEqual({ ok: false, problem: "not_https" });
    }
    expect(readLink("data:text/html,<b>x</b>")).toEqual({ ok: false, problem: "not_https" });
  });

  it("refuses an address that carries a user name or a password", () => {
    expect(readLink("https://me:secret@example.com/")).toEqual({
      ok: false,
      problem: "credentials",
    });
    expect(readLink("https://me@example.com/")).toEqual({ ok: false, problem: "credentials" });
  });

  it("refuses what is not an address of a named host", () => {
    for (const input of [
      "",
      "   ",
      "https://",
      "https://localhost/",
      "not a url",
      "https://exa mple.com",
    ]) {
      expect(readLink(input)).toEqual({ ok: false, problem: "invalid" });
    }
  });

  it("refuses an address longer than the bound, as written out", () => {
    const path = "a".repeat(MAX_LINK_LENGTH);
    expect(readLink(`https://example.com/${path}`)).toEqual({ ok: false, problem: "too_long" });
    const fits = `https://example.com/${"a".repeat(MAX_LINK_LENGTH - "https://example.com/".length)}`;
    expect(readLink(fits)).toEqual({ ok: true, url: fits });
  });
});

describe("readLinks", () => {
  it("reads each link in order", () => {
    expect(readLinks(["github.com/hajimism", "https://hajimism.dev"])).toEqual({
      ok: true,
      links: ["https://github.com/hajimism", "https://hajimism.dev/"],
    });
    expect(readLinks([])).toEqual({ ok: true, links: [] });
  });

  it("says which link is refused, and why", () => {
    expect(readLinks(["https://a.example", "http://b.example"])).toEqual({
      ok: false,
      problem: "not_https",
      at: 1,
    });
  });

  it("refuses the same link twice, as written out", () => {
    expect(readLinks(["https://a.example/", "A.example"])).toEqual({
      ok: false,
      problem: "duplicate",
      at: 1,
    });
  });

  it("takes at most five", () => {
    expect(MAX_LINKS).toBe(5);
    const links = ["a", "b", "c", "d", "e", "f"].map((host) => `https://${host}.example/`);
    expect(readLinks(links.slice(0, 5))).toEqual({ ok: true, links: links.slice(0, 5) });
    expect(readLinks(links)).toEqual({ ok: false, problem: "too_many", at: null });
  });
});

describe("linkFace", () => {
  it("names a service and the account a profile's address holds", () => {
    const faces: [string, string, string | null][] = [
      ["https://github.com/hajimism", "GitHub", "hajimism"],
      ["https://x.com/hajimism", "X", "@hajimism"],
      ["https://twitter.com/hajimism/", "X", "@hajimism"],
      ["https://mobile.twitter.com/hajimism", "X", "@hajimism"],
      ["https://bsky.app/profile/hajimism.bsky.social", "Bluesky", "@hajimism.bsky.social"],
      ["https://www.youtube.com/@hajimism", "YouTube", "@hajimism"],
      ["https://www.youtube.com/c/hajimism", "YouTube", "hajimism"],
      ["https://www.linkedin.com/in/hajime-nakagawa/", "LinkedIn", "hajime-nakagawa"],
      ["https://jp.linkedin.com/in/hajime-nakagawa", "LinkedIn", "hajime-nakagawa"],
      ["https://zenn.dev/hajimism", "Zenn", "@hajimism"],
      ["https://qiita.com/hajimism", "Qiita", "@hajimism"],
      ["https://note.com/hajimism", "note", "hajimism"],
      ["https://speakerdeck.com/hajimism", "Speaker Deck", "hajimism"],
      ["https://connpass.com/user/hajimism/", "connpass", "hajimism"],
    ];
    for (const [url, name, account] of faces) {
      expect(linkFace(url), url).toMatchObject({ name, account });
    }
  });

  it("names the service alone for one of its pages that is no profile", () => {
    expect(linkFace("https://github.com/hajimism/dek")).toEqual({
      service: "github",
      name: "GitHub",
      account: null,
    });
    expect(linkFace("https://x.com/home")).toMatchObject({ service: "x", account: null });
    expect(linkFace("https://www.youtube.com/watch?v=abc")).toMatchObject({
      service: "youtube",
      account: null,
    });
    expect(linkFace("https://zenn.dev/hajimism/articles/abc")).toMatchObject({
      service: "zenn",
      account: null,
    });
  });

  it("names any other site by its host", () => {
    expect(linkFace("https://www.hajimism.dev/about")).toEqual({
      service: "website",
      name: "hajimism.dev",
      account: null,
    });
    expect(linkFace("https://notgithub.com/hajimism")).toMatchObject({
      service: "website",
      name: "notgithub.com",
    });
    expect(linkFace("https://github.com.example/hajimism")).toMatchObject({ service: "website" });
  });

  it("shows an account written in percent-encoding as its letters", () => {
    expect(linkFace("https://note.com/%E4%B8%AD%E5%B7%9D")).toMatchObject({ account: "中川" });
  });
});

describe("firstLinks", () => {
  it("is the GitHub profile of an account made with GitHub, and none for any other", () => {
    expect(firstLinks({ githubLogin: "Octo-Cat" })).toEqual(["https://github.com/Octo-Cat"]);
    expect(firstLinks({ githubLogin: null })).toEqual([]);
  });

  it("is a list a person could have saved", () => {
    expect(readLinks(firstLinks({ githubLogin: "Octo-Cat" }))).toEqual({
      ok: true,
      links: ["https://github.com/Octo-Cat"],
    });
  });
});

describe("readName", () => {
  it("reads a name with its spaces made one", () => {
    expect(readName("  Hajime \t Nakagawa ")).toEqual({ ok: true, name: "Hajime Nakagawa" });
    expect(readName("中川 元")).toEqual({ ok: true, name: "中川 元" });
  });

  it("refuses an empty name and one longer than the bound", () => {
    expect(readName(" \n ")).toEqual({ ok: false, problem: "empty" });
    expect(readName("\u0000\u0007")).toEqual({ ok: false, problem: "empty" });
    expect(readName("a".repeat(MAX_NAME_LENGTH))).toEqual({
      ok: true,
      name: "a".repeat(MAX_NAME_LENGTH),
    });
    expect(readName("a".repeat(MAX_NAME_LENGTH + 1))).toEqual({ ok: false, problem: "too_long" });
  });
});

describe("auth.ts, through Better Auth", () => {
  const origin = "http://localhost:3000";

  function makeAuth() {
    const db = {
      user: [] as Record<string, unknown>[],
      session: [] as Record<string, unknown>[],
      account: [] as Record<string, unknown>[],
      verification: [] as Record<string, unknown>[],
      apikey: [] as Record<string, unknown>[],
      deviceCode: [] as Record<string, unknown>[],
    };
    const config = authConfig({
      defaults: {},
      env: {
        DEK_PUB_DEV_LOGIN: "1",
        AUTH_GITHUB_CLIENT_ID: "client",
        AUTH_GITHUB_CLIENT_SECRET: "secret",
      },
      dialect: "sqlite",
      request: new Request(origin),
    });
    const auth = betterAuth({
      ...config,
      baseURL: origin,
      basePath: "/api/auth",
      secret: "a-secret-only-these-tests-use-0123456789",
      database: memoryAdapter(db),
    });
    return { auth, db };
  }

  // GitHub as Better Auth's provider asks it: the token for the code, then the profile and its addresses.
  function fakeGitHub(login: string): void {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith("https://github.com/login/oauth/access_token")) {
        return Response.json({
          access_token: "gho_token",
          token_type: "bearer",
          scope: "read:user",
        });
      }
      if (url === "https://api.github.com/user") {
        return Response.json({ id: 583231, login, name: login, email: null, avatar_url: "" });
      }
      if (url === "https://api.github.com/user/emails") {
        return Response.json([{ email: "octo@example.com", primary: true, verified: true }]);
      }
      throw new Error(`nothing fakes ${url}`);
    });
  }

  function cookiesOf(response: Response): string {
    return response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
  }

  /** The GitHub callback's answer, after the sign-in it ends was started as `/signin` starts it. */
  async function signInWithGitHub(
    auth: ReturnType<typeof makeAuth>["auth"],
    next = "/",
  ): Promise<Response> {
    const start = await auth.handler(
      new Request(`${origin}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify({
          provider: "github",
          callbackURL: next,
          errorCallbackURL: signInHref(next),
        }),
      }),
    );
    const { url } = (await start.json()) as { url: string };
    const state = new URL(url).searchParams.get("state");
    return auth.handler(
      new Request(`${origin}/api/auth/callback/github?code=the-code&state=${state}`, {
        headers: { cookie: cookiesOf(start) },
      }),
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    seeding.seeded.length = 0;
    seeding.seed = async () => {};
    invitation.asked.length = 0;
    invitation.invited = true;
  });

  it("sends a GitHub sign-up the invitation list refuses back to /signin, and makes nothing", async () => {
    const { auth, db } = makeAuth();
    fakeGitHub("Octo-Cat");
    invitation.invited = false;
    const callback = await signInWithGitHub(auth, "/@sato/talk");
    expect(callback.status).toBe(302);
    const location = new URL(String(callback.headers.get("location")), origin);
    expect(location.pathname).toBe("/signin");
    expect(location.searchParams.get("next")).toBe("/@sato/talk");
    expect(location.searchParams.get("error")).toBe(NOT_INVITED);
    expect(invitation.asked).toEqual([
      { email: "octo@example.com", emailVerified: true, githubLogin: "Octo-Cat" },
    ]);
    expect(db.user).toEqual([]);
    expect(db.account).toEqual([]);
    expect(db.session).toEqual([]);
    expect(seeding.seeded).toEqual([]);
  });

  it("keeps the login of an account made with GitHub, and starts its links from it", async () => {
    const { auth, db } = makeAuth();
    fakeGitHub("Octo-Cat");
    expect((await signInWithGitHub(auth)).headers.get("location")).toBe("/");
    expect(db.user).toMatchObject([{ email: "octo@example.com", githubLogin: "Octo-Cat" }]);
    expect(seeding.seeded).toMatchObject([{ githubLogin: "Octo-Cat" }]);
  });

  it("signs the same account in with GitHub again", async () => {
    const { auth, db } = makeAuth();
    fakeGitHub("Octo-Cat");
    await signInWithGitHub(auth);
    expect((await signInWithGitHub(auth)).headers.get("location")).toBe("/");
    expect(db.user).toMatchObject([{ githubLogin: "Octo-Cat" }]);
    expect(db.session).toHaveLength(2);
    expect(seeding.seeded).toHaveLength(1);
  });

  it("takes no login from a sign-up's body", async () => {
    const { auth, db } = makeAuth();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const signUp = (fields: object) =>
      auth.handler(
        new Request(`${origin}/api/auth/sign-up/email`, {
          method: "POST",
          headers: { "content-type": "application/json", origin },
          body: JSON.stringify({
            email: "sato@example.com",
            password: "a-long-password",
            ...fields,
          }),
        }),
      );
    const named = await signUp({ name: "Sato", githubLogin: "Octo-Cat" });
    expect(named.status).toBe(403);
    expect(await named.json()).toMatchObject({ code: NOT_INVITED });
    expect(db.user).toEqual([]);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
    expect((await signUp({ name: "Sato" })).ok).toBe(true);
    expect(db.user.map((user) => user.githubLogin ?? null)).toEqual([null]);
  });

  // update-user answers no request (below), but the server may still call Better Auth to update.
  it("lets no update on the server through Better Auth change the login", async () => {
    const { auth, db } = makeAuth();
    fakeGitHub("Octo-Cat");
    const headers = new Headers({ cookie: cookiesOf(await signInWithGitHub(auth)) });
    const fixed = { statusCode: 403, body: { code: "github_login_fixed" } };
    await expect(
      auth.api.updateUser({ headers, body: { name: "Octo", githubLogin: "someone-else" } }),
    ).rejects.toMatchObject(fixed);
    const { internalAdapter } = await auth.$context;
    const id = String(db.user[0]?.id);
    await expect(
      internalAdapter.updateUser(id, { githubLogin: "someone-else" }),
    ).rejects.toMatchObject(fixed);
    expect(db.user).toMatchObject([{ name: "Octo-Cat", githubLogin: "Octo-Cat" }]);
    await auth.api.updateUser({ headers, body: { name: "Octo" } });
    expect(db.user).toMatchObject([{ name: "Octo", githubLogin: "Octo-Cat" }]);
  });

  it("has no update-user, so a name and an image go only through dek.pub's own API", async () => {
    const { auth, db } = makeAuth();
    fakeGitHub("Octo-Cat");
    const cookie = cookiesOf(await signInWithGitHub(auth));
    const session = await auth.handler(
      new Request(`${origin}/api/auth/get-session`, { headers: { cookie } }),
    );
    expect(session.status).toBe(200);
    const before = structuredClone(db.user);
    const update = (path: string) =>
      auth.handler(
        new Request(`${origin}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", origin, cookie },
          body: JSON.stringify({ name: "", image: "https://tracker.example/p.gif" }),
        }),
      );
    expect((await update("/api/auth/update-user")).status).toBe(404);
    expect((await update("/api/auth/update-user/")).status).toBe(404);
    expect(db.user).toEqual(before);
    expect(db.user).toMatchObject([{ name: "Octo-Cat" }]);
  });

  it("answers over HTTP only the endpoints dek.pub's pages, the CLI and the dev login call", () => {
    const { auth } = makeAuth();
    const disabled = new Set(auth.options.disabledPaths);
    const open = Object.values(auth.api as Record<string, { path?: string }>)
      .map((endpoint) => endpoint.path)
      .filter((path): path is string => path !== undefined && !disabled.has(path))
      .sort();
    expect(open).toEqual(
      [
        "/callback/:id",
        "/device",
        "/device/approve",
        "/device/code",
        "/device/deny",
        "/device/token",
        "/error",
        "/get-session",
        "/magic-link/verify",
        "/sign-in/email",
        "/sign-in/magic-link",
        "/sign-in/social",
        "/sign-out",
        "/sign-up/email",
      ].sort(),
    );
  });

  it("makes the account although the links it starts with could not be written", async () => {
    const { auth, db } = makeAuth();
    fakeGitHub("Octo-Cat");
    seeding.seed = async () => {
      throw new Error("D1_ERROR: the database is not there");
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const callback = await signInWithGitHub(auth);
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/");
    expect(db.user).toHaveLength(1);
    expect(seeding.seeded).toHaveLength(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("links"),
      expect.objectContaining({ message: "D1_ERROR: the database is not there" }),
    );
    error.mockRestore();
  });

  describe("CLI keys", () => {
    /** A request's context as Void hands it to dek.pub's code: Better Auth under its name. */
    function contextOf(auth: ReturnType<typeof makeAuth>["auth"]): Context {
      return { get: (name: string) => (name === "__voidAuth" ? auth : undefined) } as Context;
    }

    async function setUp() {
      const { auth, db } = makeAuth();
      const c = contextOf(auth);
      const signUp = async (email: string) => {
        const made = await auth.api.signUpEmail({
          body: { email, password: "a-long-password", name: email },
        });
        return made.user.id;
      };
      return {
        auth,
        db,
        c,
        mine: await signUp("me@example.com"),
        theirs: await signUp("them@example.com"),
      };
    }

    it("lists a person's own keys, newest first, by name and dates, and never the key", async () => {
      const { c, mine, theirs } = await setUp();
      const laptop = await makeKey(c, mine, "laptop");
      await makeKey(c, theirs, "theirs");
      await new Promise((done) => setTimeout(done, 5));
      await makeKey(c, mine, "ci");
      const keys = await keysOf(c, mine);
      expect(keys.map((key) => key.name)).toEqual(["ci", "laptop"]);
      for (const key of keys) {
        expect(Object.keys(key).sort()).toEqual(
          ["createdAt", "expiresAt", "id", "lastUsedAt", "name"].sort(),
        );
        expect(JSON.stringify(key)).not.toContain(laptop.slice(0, 12));
        expect(key.lastUsedAt).toBeNull();
        expect(Date.parse(String(key.expiresAt)) - Date.parse(key.createdAt)).toBeGreaterThan(
          364 * 24 * 60 * 60 * 1000,
        );
      }
    });

    it("says when a key was last used", async () => {
      const { c, mine } = await setUp();
      const key = await makeKey(c, mine, "laptop");
      expect(await checkKey(c, key)).toMatchObject({ userId: mine });
      const [listed] = await keysOf(c, mine);
      expect(listed?.lastUsedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("leaves out a key past its expiry", async () => {
      const { c, db, mine } = await setUp();
      await makeKey(c, mine, "old");
      for (const row of db.apikey) {
        row.expiresAt = new Date(Date.now() - 1000);
      }
      expect(await keysOf(c, mine)).toEqual([]);
    });

    it("revokes one key of the person's own, and none of anyone else's", async () => {
      const { c, mine, theirs } = await setUp();
      const kept = await makeKey(c, mine, "laptop");
      const revoked = await makeKey(c, mine, "ci");
      const other = await makeKey(c, theirs, "theirs");
      const ids = Object.fromEntries((await keysOf(c, mine)).map((key) => [key.name, key.id]));
      const [theirKey] = await keysOf(c, theirs);
      expect(await revokeKeyOf(c, mine, String(theirKey?.id))).toBe(false);
      expect(await checkKey(c, other)).not.toBeNull();
      expect(await revokeKeyOf(c, mine, String(ids.ci))).toBe(true);
      expect(await checkKey(c, revoked)).toBeNull();
      expect(await checkKey(c, kept)).not.toBeNull();
      expect(await revokeKeyOf(c, mine, String(ids.ci))).toBe(false);
    });

    it("revokes every key of the person's, counting those that worked, and no one else's", async () => {
      const { c, db, mine, theirs } = await setUp();
      const keys = [await makeKey(c, mine, "laptop"), await makeKey(c, mine, "ci")];
      await makeKey(c, mine, "old");
      const old = db.apikey.find((row) => row.name === "old");
      if (old) {
        old.expiresAt = new Date(Date.now() - 1000);
      }
      const other = await makeKey(c, theirs, "theirs");
      expect(await revokeKeysOf(c, mine)).toBe(2);
      for (const key of keys) {
        expect(await checkKey(c, key)).toBeNull();
      }
      expect(db.apikey.map((row) => row.name)).toEqual(["theirs"]);
      expect(await checkKey(c, other)).not.toBeNull();
      expect(await revokeKeysOf(c, mine)).toBe(0);
    });
  });
});

describe("keyName", () => {
  it("keeps the name the CLI sends, with its spaces made one and no control characters", () => {
    expect(keyName("hajime-mbp")).toBe("hajime-mbp");
    expect(keyName("  build\u0000 \n  box\u202e ")).toBe("build box");
  });

  it("cuts a long name, and calls a key with no name dekc", () => {
    expect(keyName("a".repeat(MAX_KEY_NAME_LENGTH + 10))).toBe("a".repeat(MAX_KEY_NAME_LENGTH));
    expect(keyName(undefined)).toBe("dekc");
    expect(keyName(" \u0007 ")).toBe("dekc");
  });
});
