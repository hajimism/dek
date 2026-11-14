import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handleGate } from "../../src/shell/handle-gate.ts";
import { applyAppHeaders } from "../../src/shell/headers.ts";
import { langHref } from "../../src/shell/lang-link.ts";
import { langLinks, langUrl } from "../../src/shell/lang-url.ts";
import { robotsFor } from "../../src/shell/robots.ts";
import { Theme } from "../../src/shell/type.ts";

describe("handleGate", () => {
  const newcomer = { id: "u1", handle: null, name: "Sato", image: null };
  const page = (path: string, init: { method?: string; accept?: string } = {}) => ({
    method: init.method ?? "GET",
    url: new URL(`http://x${path}`),
    accept: init.accept ?? "text/html,application/xhtml+xml",
    pageData: false,
  });

  it("sends an account with no handle from any page to choose one, and back after", () => {
    expect(handleGate(newcomer, page("/device?user_code=ABCD-EFGH"))).toBe(
      "/welcome?next=%2Fdevice%3Fuser_code%3DABCD-EFGH",
    );
    expect(handleGate(newcomer, page("/"))).toBe("/welcome");
    expect(handleGate(newcomer, page("/signin?next=%2F%40demo"))).toBe(
      "/welcome?next=%2Fsignin%3Fnext%3D%252F%2540demo",
    );
  });

  it("sends a page Void's router asks for as data the same way", () => {
    expect(handleGate(newcomer, { ...page("/@demo", { accept: "*/*" }), pageData: true })).toBe(
      "/welcome?next=%2F%40demo",
    );
  });

  it("lets the choosing page through, and what no page asks for: a feed, a script, a form's post", () => {
    expect(handleGate(newcomer, page("/welcome?next=%2Fdevice"))).toBeNull();
    expect(handleGate(newcomer, page("/@demo/rss", { accept: "application/rss+xml" }))).toBeNull();
    expect(handleGate(newcomer, page("/src/app.ts", { accept: "*/*" }))).toBeNull();
    expect(handleGate(newcomer, page("/", { method: "POST" }))).toBeNull();
  });

  it("lets anyone with a handle, and anyone signed out, go anywhere", () => {
    expect(handleGate({ ...newcomer, handle: "sato" }, page("/device"))).toBeNull();
    expect(handleGate(null, page("/device"))).toBeNull();
  });
});

describe("langHref", () => {
  it("keeps the path, the rest of the query and the fragment", () => {
    expect(langHref(new URL("http://x/@demo/talk?user_code=AB&lang=en#c_1"), "ja")).toBe(
      "/@demo/talk?user_code=AB&lang=ja#c_1",
    );
  });
});

describe("langUrl", () => {
  it("puts Japanese at the bare URL and every other language behind ?lang=", () => {
    expect(langUrl("https://dek.pub", "/about", "ja")).toBe("https://dek.pub/about");
    expect(langUrl("https://dek.pub", "/about", "en")).toBe("https://dek.pub/about?lang=en");
    expect(langUrl("https://dek.pub", "/", "en")).toBe("https://dek.pub/?lang=en");
  });
});

describe("langLinks", () => {
  it("names the language the page was rendered in as canonical, and every language as an alternate", () => {
    const alternates = [
      { rel: "alternate", hreflang: "en", href: "https://dek.pub/about?lang=en" },
      { rel: "alternate", hreflang: "ja", href: "https://dek.pub/about" },
      { rel: "alternate", hreflang: "x-default", href: "https://dek.pub/about" },
    ];
    expect(langLinks("https://dek.pub", "/about", "en")).toEqual([
      { rel: "canonical", href: "https://dek.pub/about?lang=en" },
      ...alternates,
    ]);
    expect(langLinks("https://dek.pub", "/about", "ja")).toEqual([
      { rel: "canonical", href: "https://dek.pub/about" },
      ...alternates,
    ]);
  });
});

describe("Theme", () => {
  it("reads the theme cookie, and anything else as the system's", () => {
    expect(Theme.parse("dark")).toBe("dark");
    expect(Theme.parse("light")).toBe("light");
    expect(Theme.parse("sepia")).toBe("system");
    expect(Theme.parse(undefined)).toBe("system");
  });
});

describe("applyAppHeaders", () => {
  const applied = (url: string, headers = new Headers()) => {
    applyAppHeaders(headers, new URL(url));
    return headers;
  };

  it("keeps the app out of frames and away from a tab a deck opens", () => {
    const headers = applied("https://dek.pub/@demo/talk");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("keeps a policy the answer already has", () => {
    const own = new Headers({ "content-security-policy": "default-src 'none'" });
    expect(applied("https://dek.pub/", own).get("content-security-policy")).toBe(
      "default-src 'none'",
    );
  });

  it("asks the browser to keep to HTTPS, over HTTPS only", () => {
    expect(applied("https://dek.pub/").get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(applied("http://localhost:5173/").has("strict-transport-security")).toBe(false);
  });

  it("turns off the devices no page of dek.pub uses, and leaves full screen alone", () => {
    const policy = applied("https://dek.pub/").get("permissions-policy") ?? "";
    for (const feature of ["camera", "microphone", "geolocation", "usb", "payment"]) {
      expect(policy).toContain(`${feature}=()`);
    }
    expect(policy).not.toContain("fullscreen");
  });
});

describe("robotsFor", () => {
  it("lets crawlers read dek.pub but its API, and names its sitemap", () => {
    const text = "User-agent: *\nDisallow: /api/\n\nSitemap: https://dek.pub/sitemap.xml\n";
    expect(robotsFor("https://dek.pub")).toBe(text);
    expect(robotsFor("https://dek.pub/")).toBe(text);
  });

  it("keeps every crawler out of any other origin, such as staging or a machine's", () => {
    expect(robotsFor("https://staging.dek.pub")).toBe("User-agent: *\nDisallow: /\n");
    expect(robotsFor("http://localhost:5173")).toBe("User-agent: *\nDisallow: /\n");
  });
});

describe("security.txt", () => {
  const text = readFileSync(
    new URL("../../public/.well-known/security.txt", import.meta.url),
    "utf8",
  );
  const field = (name: string) =>
    text
      .split("\n")
      .filter((line) => line.startsWith(`${name}: `))
      .map((line) => line.slice(name.length + 2));

  it("says where to report, in which languages, and where it lives (RFC 9116)", () => {
    expect(field("Contact")).toEqual(["https://github.com/hajimism/dek/security/advisories/new"]);
    expect(field("Policy")).toEqual(["https://github.com/hajimism/dek/blob/main/SECURITY.md"]);
    expect(field("Canonical")).toEqual(["https://dek.pub/.well-known/security.txt"]);
    expect(field("Preferred-Languages")).toEqual(["en, ja"]);
  });

  it("has a month left before it expires, and no more than a year: renew it when this fails", () => {
    const [expires] = field("Expires");
    const left = Date.parse(expires ?? "") - Date.now();
    const day = 24 * 60 * 60 * 1000;
    expect(left).toBeGreaterThan(30 * day);
    expect(left).toBeLessThanOrEqual(366 * day);
  });
});
