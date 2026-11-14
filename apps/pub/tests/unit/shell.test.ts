import { describe, expect, it } from "vitest";
import { applyAppHeaders } from "../../src/shell/headers.ts";
import { langHref } from "../../src/shell/lang-link.ts";
import { Theme } from "../../src/shell/type.ts";

describe("langHref", () => {
  it("keeps the path, the rest of the query and the fragment", () => {
    expect(langHref(new URL("http://x/@demo/talk?user_code=AB&lang=en#c_1"), "ja")).toBe(
      "/@demo/talk?user_code=AB&lang=ja#c_1",
    );
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
