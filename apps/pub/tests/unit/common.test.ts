import { describe, expect, it, vi } from "vitest";
import { createDb, sql } from "void/db";
import { sendEmail } from "void/email";
import { PROTOCOL_HEADER, PROTOCOL_VERSION } from "../../../../src/pub/protocol.ts";
import { chunks, IDS_PER_QUERY } from "../../src/common/chunks.ts";
import { docsUrl } from "../../src/common/docs.ts";
import { refusal } from "../../src/common/http.ts";
import {
  formatDate,
  guessLang,
  pickLang,
  relativeTime,
  slideCount,
  translate,
} from "../../src/common/i18n.ts";
import { log } from "../../src/common/log.ts";
import { sendMail } from "../../src/common/mail.server.ts";
import { ApiFailure } from "../../src/common/ui/api.ts";
import { failureText } from "../../src/common/ui/failure.ts";
import { xmlText } from "../../src/common/xml.ts";

vi.mock("void/email", () => ({ sendEmail: vi.fn() }));

describe("i18n", () => {
  it("picks ?lang=, then the cookie, and Japanese for anyone who has not chosen", () => {
    expect(pickLang("en", "ja")).toBe("en");
    expect(pickLang(null, "en")).toBe("en");
    expect(pickLang(null, null)).toBe("ja");
    expect(pickLang("xx", "fr")).toBe("ja");
  });

  it('signs the footer "Built with dek" in either language', () => {
    expect(translate("ja", "footer.builtWith")).toBe("Built with dek");
    expect(translate("en", "footer.builtWith")).toBe("Built with dek");
  });

  it("fills in values", () => {
    expect(translate("en", "talk.position", { n: 3, total: 12 })).toBe("Slide 3 of 12");
    expect(translate("ja", "manage.version.changed", { n: 3 })).toBe("3 枚が変更");
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

describe("chunks", () => {
  it("splits a list in order into runs of at most the size", () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunks([1, 2], 2)).toEqual([[1, 2]]);
    expect(chunks([], 2)).toEqual([]);
  });

  it("keeps every query under the 100 values D1 binds to a statement", () => {
    const ids = Array.from({ length: 2 * IDS_PER_QUERY + 1 }, (_, i) => `u${i}`);
    const runs = chunks(ids, IDS_PER_QUERY);
    expect(runs.map((run) => run.length)).toEqual([IDS_PER_QUERY, IDS_PER_QUERY, 1]);
    expect(runs.flat()).toEqual(ids);
    expect(IDS_PER_QUERY).toBeLessThan(100);
  });

  it("refuses a size that would never end", () => {
    for (const size of [0, -1, 1.5, Number.NaN]) {
      expect(() => chunks([1], size)).toThrow(RangeError);
    }
  });
});

describe("refusal", () => {
  const APP = "https://dek.pub/api/decks/d_x";

  function request(method: string, headers: Record<string, string> = {}): Request {
    return new Request(APP, { method, headers });
  }

  it("lets a client through that speaks this protocol, an older one, or says nothing", () => {
    expect(refusal(request("GET"))).toBeNull();
    expect(refusal(request("GET", { [PROTOCOL_HEADER]: String(PROTOCOL_VERSION) }))).toBeNull();
    expect(refusal(request("GET", { [PROTOCOL_HEADER]: "0" }))).toBeNull();
    expect(refusal(request("GET", { [PROTOCOL_HEADER]: "soon" }))).toBeNull();
  });

  it("tells a client that speaks a newer protocol, before anything runs", () => {
    const refused = refusal(request("POST", { [PROTOCOL_HEADER]: String(PROTOCOL_VERSION + 1) }));
    expect(refused).toMatchObject({ status: 400, code: "protocol" });
  });

  it("refuses a change made with a cookie from another origin, or from none", () => {
    for (const origin of ["https://evil.example", "null", "https://dek.pub.evil.example"]) {
      expect(refusal(request("POST", { cookie: "s=1", origin }))).toMatchObject({
        status: 403,
        code: "cross_origin",
      });
    }
    expect(refusal(request("DELETE", { cookie: "s=1" }))).toMatchObject({ code: "cross_origin" });
  });

  it("lets a change through from a page of dek.pub, or from the CLI, which sends no cookie", () => {
    expect(refusal(request("PATCH", { cookie: "s=1", origin: "https://dek.pub" }))).toBeNull();
    expect(refusal(request("POST", { authorization: "Bearer k" }))).toBeNull();
  });

  it("lets a read through with a cookie from anywhere", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(
        refusal(request(method, { cookie: "s=1", origin: "https://evil.example" })),
      ).toBeNull();
    }
  });
});

describe("failureText", () => {
  const t = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) =>
    translate("en", key, vars);

  it("says once that dek.pub could not be reached", () => {
    expect(failureText(t, new ApiFailure(0, "offline", ""))).toBe(t("common.offline"));
  });

  it("puts the server's message under the page's line", () => {
    const text = failureText(t, new ApiFailure(409, "slug_taken", "you already have that deck"));
    expect(text).toBe(t("common.error", { message: "you already have that deck" }));
  });

  it("says only that something went wrong for any other error", () => {
    expect(failureText(t, new TypeError("x is undefined"))).toBe(
      t("common.error", { message: "" }),
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

describe("docsUrl", () => {
  it("points at a page of dek's docs, in the reader's language", () => {
    expect(docsUrl("en")).toBe("https://hajimism.github.io/dek/");
    expect(docsUrl("ja")).toBe("https://hajimism.github.io/dek/ja/");
    expect(docsUrl("en", "guide/publish")).toBe(
      "https://hajimism.github.io/dek/guide/publish.html",
    );
    expect(docsUrl("ja", "guide/publish")).toBe(
      "https://hajimism.github.io/dek/ja/guide/publish.html",
    );
  });
});

describe("xmlText", () => {
  it("drops characters XML refuses and escapes the rest", () => {
    expect(xmlText("a\u0000b\u0007c\u000bd & <e> \"f\" 'g'\tok")).toBe(
      "abcd &amp; &lt;e&gt; &quot;f&quot; &apos;g&apos;\tok",
    );
    expect(xmlText("台本 😀")).toBe("台本 😀");
  });
});

describe("log", () => {
  // D1 as Void hands it to Drizzle, failing every statement as D1 does.
  function failingD1(error: Error) {
    const statement = {
      bind: () => statement,
      run: () => Promise.reject(error),
      all: () => Promise.reject(error),
      raw: () => Promise.reject(error),
    };
    return { withSession: () => ({ prepare: () => statement }) };
  }

  function logged(error: unknown): Promise<string> {
    return loggedBy(() => log("error", "an API request failed", error));
  }

  function failedQuery(value: string): Promise<unknown> {
    const d1 = new Error("D1_ERROR: UNIQUE constraint failed: user.email: SQLITE_CONSTRAINT");
    return createDb(failingD1(d1) as never)
      .run(sql`insert into user (email) values (${value})`)
      .catch((thrown: unknown) => thrown);
  }

  it("logs a failed query without the values it was bound to", async () => {
    const error = await failedQuery("ada@example.com");
    // Drizzle's own message, and the stack it heads, carry the address.
    expect(String((error as Error).stack)).toContain("ada@example.com");

    const line = await logged(error);
    expect(line).not.toContain("ada@example.com");
    expect(line).toContain("an API request failed");
    expect(line).toContain("DrizzleQueryError");
    expect(line).toContain("insert into user (email) values (?)");
    expect(line).toContain("UNIQUE constraint failed: user.email: SQLITE_CONSTRAINT");
    expect(line).toContain("at D1PreparedQuery.queryWithCache");
  });

  it("leaves out a bound value's line even when it reads as a stack frame", async () => {
    const error = await failedQuery("hello\n    at the meetup, ada@example.com said");
    expect(String((error as Error).stack)).toContain("    at the meetup, ada@example.com said");

    const line = await logged(error);
    expect(line).not.toContain("ada@example.com");
    expect(line).toContain("at D1PreparedQuery.queryWithCache");
  });

  it("logs a failed query's message, passed as a string, without its params", async () => {
    const error = (await failedQuery("ada@example.com")) as Error;
    // Better Auth logs such a message by itself when it names a column or a table.
    const line = await loggedBy(() => log("error", `Better Auth: ${error.message}`, error.message));
    expect(line).not.toContain("ada@example.com");
    expect(line).toContain("Better Auth: Failed query: insert into user (email) values (?)");
  });

  it("logs any other error by its name, message, stack and cause", async () => {
    const line = await logged(new TypeError("no deck", { cause: new RangeError("version 0") }));
    for (const part of ["TypeError", "no deck", "RangeError", "version 0", "common.test.ts"]) {
      expect(line).toContain(part);
    }
    expect(await logged("a string")).toContain("a string");
  });

  it("keeps the frames of a stack its message does not head", async () => {
    const error = new Error("renamed");
    error.stack = "Error: thrown\n    at render (page.ts:1:1)";
    expect(await logged(error)).toContain("at render (page.ts:1:1)");
  });
});

describe("mail", () => {
  const mail = { to: "ada@example.com", subject: "Sign in to dek.pub", text: "A link." };
  const unverified = {
    code: "UNVERIFIED_DESTINATION",
    message: "the destination address ada@example.com is not verified",
  };

  it("logs a mail the provider refused by its code, not by its message", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ ok: false, error: unverified } as never);
    let sent: boolean | undefined;
    const line = await loggedBy(async () => {
      sent = await sendMail(mail);
    });
    expect(sent).toBe(false);
    expect(line).toContain("UNVERIFIED_DESTINATION");
    expect(line).not.toContain("ada@example.com");
  });

  it("logs each delivery the provider refused by its code, not by its message", async () => {
    vi.mocked(sendEmail).mockResolvedValue({
      ok: false,
      deliveries: [{ ok: false, error: unverified }],
    } as never);
    const line = await loggedBy(() => sendMail(mail));
    expect(line).toContain("UNVERIFIED_DESTINATION");
    expect(line).not.toContain("ada@example.com");
  });
});

/** What `act` writes to console.error, as one string. */
async function loggedBy(act: () => unknown): Promise<string> {
  const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    await act();
    return JSON.stringify(spy.mock.calls);
  } finally {
    spy.mockRestore();
  }
}
