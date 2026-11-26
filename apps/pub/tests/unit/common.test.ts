import { describe, expect, it, vi } from "vitest";
import { createDb, sql } from "void/db";
import { sendEmail } from "void/email";
import {
  PROTOCOL_HEADER,
  PROTOCOL_MIN_VERSION,
  PROTOCOL_VERSION,
} from "../../../../src/pub/protocol.ts";
import { ApiError } from "../../src/common/api-error.ts";
import { chunks, IDS_PER_QUERY } from "../../src/common/chunks.ts";
import { docsUrl } from "../../src/common/docs.ts";
import { api } from "../../src/common/http.server.ts";
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
import { called, showFirst } from "../../src/common/ui/call.ts";
import { failedText, failureText } from "../../src/common/ui/failure.ts";
import { untilWritten } from "../../src/common/until-written.ts";
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

describe("untilWritten", () => {
  it("stops at the first attempt that writes", async () => {
    const attempt = vi.fn(async () => true);
    await untilWritten(attempt, "the file");
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("tries again while another write wins the race", async () => {
    const results = [false, false, true];
    const attempt = vi.fn(async () => results.shift() ?? false);
    await untilWritten(attempt, "the file");
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("gives up after five lost races, saying what kept changing", async () => {
    const attempt = vi.fn(async () => false);
    await expect(untilWritten(attempt, "the access file of d_x")).rejects.toThrow(
      "the access file of d_x kept changing under the write",
    );
    expect(attempt).toHaveBeenCalledTimes(5);
  });

  it("throws what an attempt throws, without trying again", async () => {
    const attempt = vi.fn(async () => {
      throw new Error("R2 is down");
    });
    await expect(untilWritten(attempt, "the file")).rejects.toThrow("R2 is down");
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});

describe("refusal", () => {
  const APP = "https://dek.pub/api/decks/d_x";

  function request(method: string, headers: Record<string, string> = {}): Request {
    return new Request(APP, { method, headers });
  }

  it("lets a client through that speaks a supported protocol or sends no header", () => {
    expect(refusal(request("GET"))).toBeNull();
    expect(refusal(request("GET", { [PROTOCOL_HEADER]: String(PROTOCOL_VERSION) }))).toBeNull();
  });

  it("refuses a malformed, older, or newer protocol header before anything runs", () => {
    const newer = refusal(request("POST", { [PROTOCOL_HEADER]: String(PROTOCOL_VERSION + 1) }));
    expect(newer).toMatchObject({ status: 400, code: "protocol" });

    const older = refusal(request("GET", { [PROTOCOL_HEADER]: String(PROTOCOL_MIN_VERSION - 1) }));
    expect(older).toMatchObject({ status: 400, code: "protocol", hint: "update dekc" });

    for (const bad of ["0", "-1", "1.5", "soon", ""]) {
      expect(refusal(request("GET", { [PROTOCOL_HEADER]: bad }))).toMatchObject({
        status: 400,
        code: "protocol",
      });
    }
  });

  it("attaches dek-protocol to every API response", async () => {
    const ok = await api(async () => ({ ok: true }), request("GET"));
    expect(ok.headers.get(PROTOCOL_HEADER)).toBe(String(PROTOCOL_VERSION));

    const refused = await api(
      async () => ({ ok: true }),
      request("GET", { [PROTOCOL_HEADER]: String(PROTOCOL_VERSION + 1) }),
    );
    expect(refused.status).toBe(400);
    expect(refused.headers.get(PROTOCOL_HEADER)).toBe(String(PROTOCOL_VERSION));

    const apiErr = await api(async () => {
      throw new ApiError(404, "not_found", "gone");
    }, request("GET"));
    expect(apiErr.status).toBe(404);
    expect(apiErr.headers.get(PROTOCOL_HEADER)).toBe(String(PROTOCOL_VERSION));
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

describe("failedText", () => {
  const t = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) =>
    translate("en", key, vars);

  it("says the same of a call that failed as of the error it threw", () => {
    expect(failedText(t, { problem: "offline", message: "" })).toBe(t("common.offline"));
    expect(failedText(t, { problem: "failed", message: "no" })).toBe(
      t("common.error", { message: "no" }),
    );
    expect(failedText(t, { problem: "too_many", message: "at most 5" })).toBe(
      t("common.error", { message: "at most 5" }),
    );
  });
});

describe("called", () => {
  const CODES = { taken: "handle_taken", too_long: "name_too_long" } as const;

  it("answers what the call answered", async () => {
    expect(await called(async () => 3, CODES)).toEqual({ ok: true, value: 3 });
  });

  it("names the problem the error's code is given to, with the server's message", async () => {
    const result = await called(async () => {
      throw new ApiFailure(409, "handle_taken", "@sato is taken");
    }, CODES);
    expect(result).toEqual({ ok: false, problem: "taken", message: "@sato is taken" });
  });

  it("says a call failed when its code is not in the table, or there is no table", async () => {
    const thrown = new ApiFailure(500, "internal", "something broke");
    expect(await called(() => Promise.reject(thrown), CODES)).toEqual({
      ok: false,
      problem: "failed",
      message: "something broke",
    });
    expect(await called(() => Promise.reject(thrown))).toEqual({
      ok: false,
      problem: "failed",
      message: "something broke",
    });
  });

  it("tells dek.pub not answering from any other error", async () => {
    expect(await called(() => Promise.reject(new ApiFailure(0, "offline", "")), CODES)).toEqual({
      ok: false,
      problem: "offline",
      message: "",
    });
    expect(await called(() => Promise.reject(new TypeError("x")), CODES)).toEqual({
      ok: false,
      problem: "failed",
      message: "",
    });
  });
});

describe("showFirst", () => {
  function box<T>(value: T) {
    const seen: T[] = [];
    return {
      seen,
      shown: {
        get: () => value,
        set: (next: T) => {
          value = next;
          seen.push(next);
        },
      },
    };
  }

  it("shows the change before the call answers, then what it answers", async () => {
    const { seen, shown } = box(1);
    let shownDuring: number | null = null;
    const done = await showFirst(
      shown,
      2,
      async () => {
        shownDuring = shown.get();
        return 3;
      },
      vi.fn(),
    );
    expect([done, shownDuring, seen]).toEqual([true, 2, [2, 3]]);
  });

  it("puts back what was shown when the call fails, and says why", async () => {
    const { seen, shown } = box([1, 2]);
    const failed = vi.fn();
    const error = new ApiFailure(0, "offline", "");
    const done = await showFirst(shown, [1], () => Promise.reject(error), failed);
    expect([done, seen, failed.mock.calls]).toEqual([false, [[1], [1, 2]], [[error]]]);
  });

  /** A call that answers when the test says. */
  function later<T>() {
    let answer!: (value: T) => void;
    let fail!: (error: unknown) => void;
    const promise = new Promise<T>((resolve, reject) => {
      answer = resolve;
      fail = reject;
    });
    return { call: () => promise, answer, fail };
  }

  it("shows what the latest change answers, not one made before it that answers after", async () => {
    const { shown } = box(false);
    const [first, second] = [later<boolean>(), later<boolean>()];
    const made = [
      showFirst(shown, true, first.call, vi.fn()),
      showFirst(shown, false, second.call, vi.fn()),
    ];
    second.answer(false);
    first.answer(true);
    expect([await Promise.all(made), shown.get()]).toEqual([[true, true], false]);
  });

  it("leaves a newer change shown when an older one fails, and still says why", async () => {
    const { shown } = box(0);
    const [first, second] = [later<number>(), later<number>()];
    const failed = vi.fn();
    const made = [
      showFirst(shown, 1, first.call, failed),
      showFirst(shown, 2, second.call, vi.fn()),
    ];
    const error = new Error("down");
    first.fail(error);
    await made[0];
    expect([shown.get(), failed.mock.calls]).toEqual([2, [[error]]]);
    second.answer(2);
    await made[1];
    expect(shown.get()).toBe(2);
  });

  it("puts back the last value a call answered when the latest change fails", async () => {
    const { shown } = box(0);
    const [first, second] = [later<number>(), later<number>()];
    const made = [
      showFirst(shown, 1, first.call, vi.fn()),
      showFirst(shown, 2, second.call, vi.fn()),
    ];
    first.answer(7);
    await made[0];
    expect(shown.get()).toBe(2);
    second.fail(new Error("down"));
    await made[1];
    expect(shown.get()).toBe(7);
  });

  it("shows what an older change answers when the newer one failed before it", async () => {
    const { shown } = box(false);
    const [first, second] = [later<boolean>(), later<boolean>()];
    const made = [
      showFirst(shown, true, first.call, vi.fn()),
      showFirst(shown, false, second.call, vi.fn()),
    ];
    second.fail(new Error("down"));
    await made[1];
    first.answer(true);
    await made[0];
    expect(shown.get()).toBe(true);
  });

  it("starts from what is shown again once no change is waiting", async () => {
    const { shown } = box(0);
    await showFirst(shown, 1, async () => 1, vi.fn());
    shown.set(5);
    await showFirst(shown, 6, () => Promise.reject(new Error("down")), vi.fn());
    expect(shown.get()).toBe(5);
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
