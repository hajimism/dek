import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { accessKey, type DeckAccess, versionKey } from "../../src/lib/deck-origin.ts";
import { signServeToken } from "../../src/lib/serve-token.ts";
import { handleServe, type ServeEnv } from "../src/index.ts";

const DECK = "d_7x2kq9m4ab";
const HOST = "https://d-7x2kq9m4ab.dekusercontent.com";
const NOW = 1_800_000_000;
const testEnv = env as unknown as ServeEnv;

async function putDeck(access: DeckAccess): Promise<void> {
  await testEnv.STORAGE.put(accessKey(DECK), JSON.stringify(access));
  for (const variant of ["full", "public", "bare"]) {
    await testEnv.STORAGE.put(versionKey(DECK, 1, `${variant}.html`), `<p>${variant}</p>`);
  }
}

function get(path: string): Promise<Response> {
  return handleServe(new Request(`${HOST}${path}`), testEnv, NOW);
}

async function token(variant: "full" | "public" | "bare", n = 1, exp = NOW + 60): Promise<string> {
  return signServeToken(testEnv.SERVE_TOKEN_SECRET, { deck: DECK, n, variant, exp });
}

describe("a public deck", () => {
  beforeEach(() =>
    putDeck({ visibility: "public", scriptPublic: true, embed: false, current: 1 }),
  );

  it("serves its current version's public build to anyone, cacheable", async () => {
    const response = await get("/v/1/");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<p>public</p>");
    expect(response.headers.get("cache-control")).toContain("public");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("serves the build without a script when the script is not public", async () => {
    await putDeck({ visibility: "public", scriptPublic: false, embed: false, current: 1 });
    expect(await (await get("/v/1/")).text()).toBe("<p>bare</p>");
  });

  it("lets only the app frame it unless embedding is on", async () => {
    const closed = await get("/v/1/");
    expect(closed.headers.get("content-security-policy")).toContain("frame-ancestors https://dek.pub");
    await putDeck({ visibility: "public", scriptPublic: true, embed: true, current: 1 });
    const open = await get("/v/1/");
    expect(open.headers.get("content-security-policy")).toContain("frame-ancestors *");
  });

  it("stops every request out of the deck", async () => {
    const csp = (await get("/v/1/")).headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("form-action 'none'");
  });
});

describe("a deck that is not public", () => {
  beforeEach(() => putDeck({ visibility: "link", scriptPublic: true, embed: true, current: 1 }));

  it("is not found without a token", async () => {
    expect((await get("/v/1/")).status).toBe(404);
  });

  it("serves the build a token names, privately", async () => {
    const response = await get(`/v/1/?t=${await token("full")}`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<p>full</p>");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors https://dek.pub");
  });

  it("refuses an expired token, or one for another version", async () => {
    expect((await get(`/v/1/?t=${await token("full", 1, NOW - 1)}`)).status).toBe(403);
    expect((await get(`/v/1/?t=${await token("full", 2)}`)).status).toBe(403);
  });

  it("refuses a token signed with another secret", async () => {
    const forged = await signServeToken("other", { deck: DECK, n: 1, variant: "full", exp: NOW + 60 });
    expect((await get(`/v/1/?t=${forged}`)).status).toBe(403);
  });
});

describe("anything else", () => {
  it("is not found: other paths, other hosts, unknown decks", async () => {
    await putDeck({ visibility: "public", scriptPublic: true, embed: false, current: 1 });
    expect((await get("/v/1/full.html")).status).toBe(404);
    expect((await get("/decks/")).status).toBe(404);
    const otherHost = await handleServe(new Request("https://dek.pub/v/1/"), testEnv, NOW);
    expect(otherHost.status).toBe(404);
    const unknown = await handleServe(
      new Request("https://d-0000000000.dekusercontent.com/v/1/"),
      testEnv,
      NOW,
    );
    expect(unknown.status).toBe(404);
  });

  it("answers only GET and HEAD", async () => {
    const response = await handleServe(new Request(`${HOST}/v/1/`, { method: "POST" }), testEnv, NOW);
    expect(response.status).toBe(405);
  });
});
