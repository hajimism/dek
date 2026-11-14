import { afterEach, describe, expect, it, vi } from "vitest";
import { decide, lookUp } from "../../src/model/person/feature/connect-cli/device-api.ts";

/** Answer the next fetch with `body` (as JSON unless it is a string) and `status`, or fail. */
function answer(body: unknown, status = 200) {
  const fetch = vi.fn(async (_path: string, _init?: RequestInit) => {
    if (body === null) {
      throw new TypeError("offline");
    }
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the device flow's calls", () => {
  it("look a pending code up, with the scope it asks for", async () => {
    const fetch = answer({ status: "pending", client_id: "dekc", scope: "deck:write" });
    expect(await lookUp("ABCD-EFGH")).toEqual({ ok: true, scope: "deck:write" });
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/auth/device?user_code=ABCD-EFGH");
    expect(fetch.mock.calls[0]?.[1]?.credentials).toBe("same-origin");
  });

  it("tell an expired code, a used one, and one that is neither", async () => {
    answer({ error: "expired_token" }, 400);
    expect(await lookUp("ABCD-EFGH")).toEqual({ ok: false, problem: "expired" });
    answer({ status: "approved", client_id: "dekc" });
    expect(await lookUp("ABCD-EFGH")).toEqual({ ok: false, problem: "used" });
    answer("<html>bad gateway</html>", 502);
    expect(await lookUp("ABCD-EFGH")).toEqual({ ok: false, problem: "invalid" });
  });

  it("say so when no answer comes", async () => {
    answer(null);
    expect(await lookUp("ABCD-EFGH")).toEqual({ ok: false, problem: "offline" });
    answer(null);
    expect(await decide("ABCD-EFGH", true)).toEqual({ ok: false, problem: "offline" });
  });

  it("approve or deny a code with a JSON body", async () => {
    const fetch = answer({ success: true });
    expect(await decide("ABCD-EFGH", true)).toEqual({ ok: true });
    const [path, init] = fetch.mock.calls[0] ?? [];
    expect(path).toBe("/api/auth/device/approve");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({ userCode: "ABCD-EFGH" });
    answer({ error: "already processed" }, 400);
    expect(await decide("ABCD-EFGH", false)).toEqual({ ok: false, problem: "used" });
  });
});
