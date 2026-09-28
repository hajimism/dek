import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { qrMatrix, renderQr } from "../../src/cli/qr.ts";
import { devBanner, devSessionView, offerPairing, pairingBlock } from "../../src/cli/serve.ts";

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

describe("devSessionView", () => {
  const server = {
    url: "http://127.0.0.1:5173/",
    remoteUrls: ["http://127.0.0.1:5173/", "http://192.168.1.2:5173/"],
  };

  test("pairs a phone straight into the one deck's presenter view", () => {
    const view = devSessionView({ ...server, deckDir: "/decks/demo", decks: ["demo"] }, "pw");
    expect(view.pairPath).toBe("presenter");
    expect(view.banner).toContain("presenter: http://192.168.1.2:5173/presenter\n");
  });

  test("names each deck's presenter view when it serves the whole project, and pairs into the list", () => {
    const view = devSessionView({ ...server, decks: ["alpha", "beta"] }, "pw");
    expect(view.pairPath).toBe("");
    expect(view.banner).toContain("presenter: http://192.168.1.2:5173/decks/alpha/presenter\n");
    expect(view.banner).toContain("presenter: http://192.168.1.2:5173/decks/beta/presenter\n");
  });

  test("pairs a project of one deck into that deck's presenter view", () => {
    expect(devSessionView({ ...server, decks: ["alpha"] }, "pw").pairPath).toBe(
      "decks/alpha/presenter",
    );
  });
});
