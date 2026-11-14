import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import appConfig from "../void.config.ts";
import { siteFor } from "./site.ts";

const APP = join(import.meta.dir, "..");

describe("siteFor", () => {
  const prod = siteFor("prod");

  test("names the origins the app and the serve Worker default to", () => {
    const env = readFileSync(join(APP, "env.ts"), "utf8");
    expect(env).toContain(`APP_ORIGIN: url().default("https://${prod.app}")`);
    expect(env).toContain(`DECK_ORIGIN: string().default("https://d-{id}.${prod.decks}")`);
    const wrangler = readFileSync(join(APP, "serve", "wrangler.jsonc"), "utf8");
    expect(wrangler).toContain(`"APP_ORIGIN": "https://${prod.app}"`);
  });

  test("routes every deck host to the serve Worker, as its wrangler.jsonc does", () => {
    const wrangler = readFileSync(join(APP, "serve", "wrangler.jsonc"), "utf8");
    expect(wrangler).toContain(`"pattern": "${prod.deckRoute}"`);
    expect(wrangler).toContain(`"zone_name": "${prod.decks}"`);
    expect(prod.deckRoute).toBe("*.dekusercontent.com/*");
  });

  test("says neither domain sends mail but the sending subdomain", () => {
    for (const zone of prod.zones) {
      expect(zone.spf).toBe("v=spf1 -all");
      expect(zone.dmarc).toStartWith("v=DMARC1; p=reject");
    }
  });

  test("refuses a stage whose names are not decided yet", () => {
    expect(() => siteFor("staging")).toThrow("staging");
    expect(() => siteFor("dev_hajime")).toThrow("prod");
  });
});

// `void deploy` binds it from void.config.ts, and `wrangler deploy` from serve/wrangler.jsonc.
test("gives the app and the serve Worker one R2 bucket", () => {
  const wrangler = Bun.JSONC.parse(readFileSync(join(APP, "serve", "wrangler.jsonc"), "utf8")) as {
    r2_buckets: unknown;
  };
  expect(wrangler.r2_buckets).toEqual(appConfig.cloudflare.r2_buckets);
  expect(wrangler.r2_buckets).toEqual([{ binding: "STORAGE", bucket_name: "dek-pub" }]);
});
