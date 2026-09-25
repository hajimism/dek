import { describe, expect, test } from "bun:test";
import { hostname } from "node:os";
import {
  clearance,
  EVENT_EXPOSURE,
  mayRead,
  ROUTE_EXPOSURE,
  requestGuard,
} from "../../src/server/auth.ts";

const basic = (password: string) => `Basic ${Buffer.from(`dek:${password}`).toString("base64")}`;

describe("clearance", () => {
  test("clears every request for the presenter when no password is set", () => {
    expect(clearance(new Request("http://127.0.0.1/ws"), undefined)).toBe("presenter");
  });

  test("clears matching basic credentials or a token query, and nothing else", () => {
    const at = (url: string, headers: Record<string, string> = {}) =>
      clearance(new Request(url, { headers }), "secret");
    expect(at("http://127.0.0.1/presenter", { authorization: basic("secret") })).toBe("presenter");
    expect(at("http://127.0.0.1/ws?token=secret")).toBe("presenter");
    expect(at("http://127.0.0.1/ws?token=nope")).toBe("audience");
    expect(at("http://127.0.0.1/presenter", { authorization: basic("nope") })).toBe("audience");
    expect(at("http://127.0.0.1/presenter", { authorization: "Basic %%%" })).toBe("audience");
    expect(at("http://127.0.0.1/presenter")).toBe("audience");
  });
});

describe("exposure", () => {
  test("keeps the script, the voice made from it, and control for the presenter", () => {
    expect(ROUTE_EXPOSURE.presenter).toBe("presenter");
    expect(ROUTE_EXPOSURE.voice).toBe("presenter");
    expect(ROUTE_EXPOSURE.control).toBe("presenter");
    expect(ROUTE_EXPOSURE.player).toBe("audience");
    expect(EVENT_EXPOSURE.diagnostics).toBe("presenter");
    expect(EVENT_EXPOSURE["reload-slide"]).toBe("audience");
  });

  test("lets the presenter read everything and the audience only its share", () => {
    expect(mayRead("presenter", "presenter")).toBe(true);
    expect(mayRead("presenter", "audience")).toBe(true);
    expect(mayRead("audience", "audience")).toBe(true);
    expect(mayRead("audience", "presenter")).toBe(false);
  });
});

describe("requestGuard", () => {
  const request = (url: string, headers: Record<string, string> = {}, method = "GET") =>
    new Request(url, { method, headers });

  test("answers 400 to a path whose percent-encoding does not decode", () => {
    const local = { remote: false };
    expect(requestGuard(request("http://127.0.0.1:4777/assets/%E0%A4%A"), local)?.status).toBe(400);
    expect(requestGuard(request("http://127.0.0.1:4777/assets/a%20b.png"), local)).toBeUndefined();
  });

  test("serves a local server only under a loopback host name, against DNS rebinding", () => {
    const local = { remote: false };
    expect(requestGuard(request("http://127.0.0.1:4777/"), local)).toBeUndefined();
    expect(requestGuard(request("http://localhost:4777/"), local)).toBeUndefined();
    expect(requestGuard(request("http://[::1]:4777/"), local)).toBeUndefined();
    expect(requestGuard(request("http://attacker.example:4777/"), local)?.status).toBe(403);
  });

  test("serves --remote under an address or this machine's name, never another DNS name", () => {
    const remote = { remote: true };
    const machine = hostname()
      .toLowerCase()
      .replace(/\.local$/, "");
    expect(requestGuard(request("http://192.168.1.20:4777/"), remote)).toBeUndefined();
    expect(requestGuard(request("http://[fe80::1]:4777/"), remote)).toBeUndefined();
    expect(requestGuard(request("http://localhost:4777/"), remote)).toBeUndefined();
    expect(requestGuard(request(`http://${machine}.local:4777/`), remote)).toBeUndefined();
    // A page on another site that points its own name at this address reads nothing here.
    expect(requestGuard(request("http://attacker.example:4777/"), remote)?.status).toBe(403);
    expect(
      requestGuard(
        request("http://attacker.example:4777/ws", {
          origin: "http://attacker.example:4777",
          upgrade: "websocket",
        }),
        remote,
      )?.status,
    ).toBe(403);
  });

  test("refuses a move or a socket from another origin", () => {
    const local = { remote: false };
    const evil = { origin: "https://attacker.example" };
    expect(requestGuard(request("http://127.0.0.1:4777/goto", evil, "POST"), local)?.status).toBe(
      403,
    );
    expect(
      requestGuard(request("http://127.0.0.1:4777/ws", { ...evil, upgrade: "websocket" }), local)
        ?.status,
    ).toBe(403);
    expect(
      requestGuard(
        request("http://127.0.0.1:4777/ws", { origin: "null", upgrade: "websocket" }),
        local,
      )?.status,
    ).toBe(403);
  });

  test("allows the deck's own page, and dek goto, which sends no Origin", () => {
    const local = { remote: false };
    expect(
      requestGuard(
        request("http://127.0.0.1:4777/ws", {
          origin: "http://127.0.0.1:4777",
          upgrade: "websocket",
        }),
        local,
      ),
    ).toBeUndefined();
    expect(requestGuard(request("http://127.0.0.1:4777/goto", {}, "POST"), local)).toBeUndefined();
    // Reading a page from another origin is harmless; the browser keeps its body from them.
    expect(
      requestGuard(
        request("http://127.0.0.1:4777/", { origin: "https://attacker.example" }),
        local,
      ),
    ).toBeUndefined();
  });
});
