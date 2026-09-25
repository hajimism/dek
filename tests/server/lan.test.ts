import { describe, expect, test } from "bun:test";
import type { NetworkInterfaceInfo } from "node:os";
import { generateRemotePassword, lanUrls, remoteBanner } from "../../src/server/lan.ts";

const loopback: NetworkInterfaceInfo = {
  address: "127.0.0.1",
  netmask: "255.0.0.0",
  family: "IPv4",
  mac: "00:00:00:00:00:00",
  internal: true,
  cidr: "127.0.0.1/8",
};

const lan: NetworkInterfaceInfo = {
  address: "192.168.1.20",
  netmask: "255.255.255.0",
  family: "IPv4",
  mac: "aa:bb:cc:dd:ee:ff",
  internal: false,
  cidr: "192.168.1.20/24",
};

const ipv6: NetworkInterfaceInfo = {
  address: "fe80::1",
  netmask: "ffff:ffff:ffff:ffff::",
  family: "IPv6",
  mac: "aa:bb:cc:dd:ee:ff",
  internal: false,
  cidr: "fe80::1/64",
  scopeid: 5,
};

describe("lanUrls", () => {
  test("returns http URLs for non-internal IPv4 addresses", () => {
    expect(
      lanUrls(5173, {
        lo0: [loopback],
        en0: [lan, ipv6],
      }),
    ).toEqual(["http://192.168.1.20:5173/"]);
  });

  test("returns an empty list when every address is loopback or IPv6", () => {
    expect(lanUrls(80, { lo0: [loopback], en0: [ipv6] })).toEqual([]);
  });
});

describe("remoteBanner", () => {
  test("points at /presenter when the server is scoped to a deck", () => {
    const text = remoteBanner("http://127.0.0.1:5173/", ["http://192.168.1.20:5173/"], {
      password: "secret",
      presenterPaths: ["presenter"],
    });
    expect(text).toContain("http://127.0.0.1:5173/");
    expect(text).toContain("presenter: http://192.168.1.20:5173/presenter");
    expect(text).toContain("password: secret");
  });

  test("does not advertise a root /presenter from the project root", () => {
    const text = remoteBanner("http://127.0.0.1:5173/", ["http://192.168.1.20:5173/"], {
      password: "secret",
      presenterPaths: ["decks/demo/presenter"],
    });
    expect(text).toContain("presenter: http://192.168.1.20:5173/decks/demo/presenter");
    expect(text).not.toContain("presenter: http://192.168.1.20:5173/presenter\n");
    expect(
      text.split("\n").some((line) => line === "presenter: http://192.168.1.20:5173/presenter"),
    ).toBe(false);
  });
});

describe("generateRemotePassword", () => {
  test("is long enough to resist guessing on a LAN, in letters easy to read aloud", () => {
    const password = generateRemotePassword();
    // 10 characters of a 32-letter alphabet: 50 bits.
    expect(password).toMatch(/^[a-km-np-z2-9]{10}$/);
    expect(generateRemotePassword()).not.toBe(password);
  });
});
