import { describe, expect, test } from "bun:test";
import { presenterAuth, wsHasControl } from "../../src/server/auth.ts";

describe("presenterAuth", () => {
  test("returns 401 for malformed basic credentials instead of throwing", () => {
    const response = presenterAuth(
      new Request("http://127.0.0.1/presenter", {
        headers: { authorization: "Basic %%%" },
      }),
      "presenter",
      "secret",
    );
    expect(response?.status).toBe(401);
  });

  test("accepts a matching password", () => {
    const header = `Basic ${Buffer.from("dek:secret").toString("base64")}`;
    expect(
      presenterAuth(
        new Request("http://127.0.0.1/presenter", { headers: { authorization: header } }),
        "presenter",
        "secret",
      ),
    ).toBeUndefined();
  });
});

describe("wsHasControl", () => {
  test("allows every socket when no password is set", () => {
    expect(wsHasControl(new Request("http://127.0.0.1/ws"), undefined)).toBe(true);
  });

  test("allows a matching token query when a password is set", () => {
    expect(wsHasControl(new Request("http://127.0.0.1/ws?token=secret"), "secret")).toBe(true);
    expect(wsHasControl(new Request("http://127.0.0.1/ws?token=nope"), "secret")).toBe(false);
    expect(wsHasControl(new Request("http://127.0.0.1/ws"), "secret")).toBe(false);
  });

  test("allows matching basic credentials on the upgrade request", () => {
    const header = `Basic ${Buffer.from("dek:secret").toString("base64")}`;
    expect(
      wsHasControl(
        new Request("http://127.0.0.1/ws", { headers: { authorization: header } }),
        "secret",
      ),
    ).toBe(true);
  });
});
