import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { deckSlug } from "../../src/cli/pub.ts";
import { DEFAULT_SERVER, serverOrigin } from "../../src/core/pub/client.ts";
import { awaitLogin, startLogin } from "../../src/core/pub/login.ts";
import { locateQuote } from "../../src/core/pub/quote.ts";
import { forgetKey, readKey, storeKey } from "../../src/core/pub/store.ts";
import { deckSource, renamesSince } from "../../src/core/pub/version.ts";
import { resolveProject } from "../../src/core/resolve.ts";
import { withFakePub } from "../helpers/fake-pub.ts";
import { withTempDir } from "../helpers/fs.ts";
import { withTempProject } from "../helpers/project.ts";

describe("serverOrigin", () => {
  test("takes --server, then DEK_PUB_SERVER, then dek.pub, as an origin", () => {
    expect(serverOrigin("https://pub.example.com/some/path", {})).toBe("https://pub.example.com");
    expect(serverOrigin(undefined, { DEK_PUB_SERVER: "http://localhost:5173/" })).toBe(
      "http://localhost:5173",
    );
    expect(serverOrigin(undefined, {})).toBe(DEFAULT_SERVER);
  });

  test("sends a key over plain HTTP only to this machine", () => {
    expect(() => serverOrigin("http://pub.example.com", {})).toThrow("is not served over HTTPS");
    expect(() => serverOrigin(undefined, { DEK_PUB_SERVER: "ftp://x" })).toThrow(
      'DEK_PUB_SERVER "ftp://x" is not served over HTTPS',
    );
    expect(() => serverOrigin("not a url", {})).toThrow('invalid --server "not a url"');
  });
});

describe("the key store", () => {
  test("keeps a key per server in a file only its owner reads, when DEK_PUB_CREDENTIALS names it", async () => {
    await withTempDir(async (dir) => {
      const env = { DEK_PUB_CREDENTIALS: join(dir, "dek", "credentials.json") };
      expect(await readKey("https://a.example", env)).toBeUndefined();
      expect(await storeKey("https://a.example", "k1", env)).toBe("file");
      await storeKey("https://b.example", "k2", env);
      expect(await readKey("https://a.example", env)).toEqual({ key: "k1", source: "file" });
      expect(statSync(env.DEK_PUB_CREDENTIALS).mode & 0o777).toBe(0o600);
      expect(await forgetKey("https://a.example", env)).toBe(true);
      expect(await readKey("https://a.example", env)).toBeUndefined();
      expect(await readKey("https://b.example", env)).toEqual({ key: "k2", source: "file" });
      await forgetKey("https://b.example", env);
      expect(existsSync(env.DEK_PUB_CREDENTIALS)).toBe(false);
    });
  });

  test("takes DEK_TOKEN over any key kept", async () => {
    await withTempDir(async (dir) => {
      const env = { DEK_PUB_CREDENTIALS: join(dir, "credentials.json"), DEK_TOKEN: " ci " };
      await storeKey("https://a.example", "kept", env);
      expect(await readKey("https://a.example", env)).toEqual({ key: "ci", source: "env" });
    });
  });

  test("says how to recover from a file that does not read", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "credentials.json");
      await Bun.write(path, "{");
      await expect(readKey("https://a.example", { DEK_PUB_CREDENTIALS: path })).rejects.toThrow(
        "does not read",
      );
    });
  });
});

describe("the device flow", () => {
  test("waits longer when told to slow down, and keeps the key once approved", async () => {
    await withFakePub(async (fake) => {
      fake.pendingPolls = 1;
      fake.respond = (request) =>
        request.path === "/api/auth/device/token" && fake.requests.length === 2
          ? Response.json({ error: "slow_down" }, { status: 400 })
          : undefined;
      const login = await startLogin(fake.url);
      expect(login.interval).toBe(0);
      const waits: number[] = [];
      const signedIn = await awaitLogin(fake.url, login, {
        now: () => Date.now(),
        sleep: async (ms) => {
          waits.push(ms);
        },
      });
      expect(signedIn).toEqual({ status: "signed-in", me: fake.me, stored: "file" });
      // slow_down adds five seconds to every wait after it.
      expect(waits).toEqual([5000, 5000]);
      const file = JSON.parse(readFileSync(fake.credentials, "utf8"));
      expect(fake.keys.has(file.keys[fake.url])).toBe(true);
    });
  });

  test("gives up once the code would expire, and forgets it", async () => {
    await withFakePub(async (fake) => {
      fake.pendingPolls = 100;
      const login = await startLogin(fake.url);
      const later = Date.parse(login.expiresAt) + 1;
      await expect(
        awaitLogin(fake.url, login, { now: () => later, sleep: async () => {} }),
      ).rejects.toThrow("the sign-in code expired before it was approved");
      expect(existsSync(join(fake.credentials, "..", "login.json"))).toBe(false);
    });
  });
});

describe("locateQuote", () => {
  const source =
    "---\ntitle: T\n---\n\n## intro\n\nThe *fast* path, and [the docs](https://x).\n<!-- note -->\nThe fast path again.\n\n## end\n\nThe fast path.\n";

  test("finds a passage of the rendered text in the Markdown, by line and column", () => {
    expect(
      locateQuote(
        source,
        { quote: "fast path, and the docs", prefix: "The ", suffix: "." },
        {
          from: 5,
          to: 10,
        },
      ),
    ).toEqual({ line: 7, column: 6 });
  });

  test("takes the place whose prefix and suffix match, within the slide's lines", () => {
    expect(
      locateQuote(
        source,
        { quote: "fast path", prefix: "The ", suffix: " again" },
        { from: 5, to: 10 },
      ),
    ).toEqual({ line: 9, column: 5 });
    expect(
      locateQuote(source, { quote: "fast path", prefix: "", suffix: "" }, { from: 11, to: 14 }),
    ).toEqual({ line: 13, column: 5 });
    expect(
      locateQuote(source, { quote: "slow path", prefix: "", suffix: "" }, { from: 1, to: 14 }),
    ).toBeUndefined();
  });
});

describe("a version's source", () => {
  test("is the same bytes for the same deck, without dist/, .cache/, or dot files", async () => {
    await withTempProject({ decks: [{ name: "talk" }] }, async (root) => {
      const dir = join(root, "decks", "talk");
      await Bun.write(join(dir, "dist", "talk.html"), "built");
      await Bun.write(join(dir, ".cache", "shots", "x.png"), "x");
      await Bun.write(join(dir, ".DS_Store"), "x");
      const target = () => {
        const project = resolveProject(dir);
        const deck = project.decks[0];
        if (!deck) {
          throw new Error("no deck");
        }
        return { project, deck };
      };
      const first = deckSource(target());
      await Bun.sleep(5);
      expect(deckSource(target())).toEqual(first);
      const text = new TextDecoder().decode(first);
      expect(text).toContain("decks/talk/script.md");
      expect(text).toContain("effective-config.json");
      expect(text).not.toContain("dist/talk.html");
      expect(text).not.toContain(".cache");
      expect(text).not.toContain(".DS_Store");
    });
  });

  test("sends the renames made since the newest version, and none for a new deck", () => {
    const renames = [
      { from: "a", to: "b", at: "2026-01-01T00:00:00.000Z" },
      { from: "b", to: "c", at: "2026-03-01T00:00:00.000Z" },
    ];
    expect(renamesSince(renames, "2026-02-01T00:00:00.000Z")).toEqual([renames[1]]);
    expect(renamesSince(renames, undefined)).toEqual([]);
  });
});

describe("deckSlug", () => {
  test("lowercases a folder name to what dek.pub takes", () => {
    expect(deckSlug("2026-10_Why Dek!")).toBe("2026-10-why-dek");
    expect(deckSlug("発表")).toBe("deck");
    expect(deckSlug("a".repeat(80))).toHaveLength(63);
  });
});
