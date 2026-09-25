import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { qrMatrix, renderQr } from "../../src/cli/qr.ts";
import { devBanner, offerPairing, pairingBlock, parsePort } from "../../src/cli/serve.ts";
import { DekError } from "../../src/core/error.ts";

describe("parsePort", () => {
  test("leaves the port to the OS when the flag is absent", () => {
    expect(parsePort(undefined)).toBeUndefined();
  });

  test("accepts a TCP port", () => {
    expect(parsePort("3030")).toBe(3030);
  });

  test.each(["0", "65536", "30x", "-1", ""])("rejects %p with a hint", (value) => {
    expect(() => parsePort(value)).toThrow(DekError);
    try {
      parsePort(value);
    } catch (error) {
      expect((error as DekError).hint).toBe("pass a port from 1 to 65535, e.g. `dek --port 3030`");
    }
  });
});

describe("devBanner", () => {
  test("names the keys a viewer cannot discover and how to stop", () => {
    expect(devBanner("http://127.0.0.1:5173/", [], {})).toBe(
      "http://127.0.0.1:5173/\n\np presenter view · s slide rail · Ctrl-C stops the server",
    );
  });
});

describe("pairingBlock", () => {
  test("is a QR code of the presenter link with the code, then what it does", () => {
    const block = pairingBlock({
      host: "http://192.168.1.20:5173/",
      path: "presenter",
      code: "abcdefghijkmnpqr",
      color: false,
    });
    const qr = renderQr(qrMatrix("http://192.168.1.20:5173/presenter?pair=abcdefghijkmnpqr"), {
      color: false,
    });
    expect(block.startsWith(qr)).toBe(true);
    expect(block.slice(qr.length)).toBe(
      "\nscan to open the presenter view on a phone · works once, within 5 minutes · Enter makes a new code",
    );
    // The code itself is never printed as text, where a log or a scrollback would keep it.
    expect(block).not.toContain("abcdefghijkmnpqr");
  });

  test("names the deck list when the project has more than one deck", () => {
    const block = pairingBlock({
      host: "http://192.168.1.20:5173/",
      path: "",
      code: "abcdefghijkmnpqr",
      color: false,
    });
    expect(block).toContain("scan to pick a deck as the presenter on a phone");
  });
});

describe("offerPairing", () => {
  const server = () => {
    let n = 0;
    return {
      remoteUrls: ["http://127.0.0.1:5173/", "http://192.168.1.20:5173/"],
      pair: () => `code${String(++n).padStart(12, "a")}`,
    };
  };
  const terminal = () => {
    const written: string[] = [];
    return { written, out: { isTTY: true, write: (text: string) => written.push(text) } };
  };

  test("prints a code at start and a new one on each Enter", () => {
    const { written, out } = terminal();
    const input = Object.assign(new EventEmitter(), { isTTY: true });
    offerPairing(server(), "presenter", { out, input, color: false });
    expect(written).toHaveLength(1);
    input.emit("data", Buffer.from("\n"));
    expect(written).toHaveLength(2);
    expect(written[1]).not.toBe(written[0]);
  });

  test("prints nothing into a pipe, where no one can scan it", () => {
    const written: string[] = [];
    const out = { isTTY: false, write: (text: string) => written.push(text) };
    offerPairing(server(), "presenter", { out, input: new EventEmitter(), color: false });
    expect(written).toEqual([]);
  });

  test("says why there is no code without a LAN address", () => {
    const { written, out } = terminal();
    offerPairing({ remoteUrls: ["http://127.0.0.1:5173/"], pair: () => "x" }, "presenter", {
      out,
      input: new EventEmitter(),
      color: false,
    });
    expect(written.join("")).toContain("no LAN address");
  });
});
