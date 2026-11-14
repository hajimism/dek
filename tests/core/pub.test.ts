import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { deckSlug } from "../../src/cli/pub.ts";
import { DEFAULT_SERVER, serverOrigin } from "../../src/core/pub/client.ts";
import { awaitLogin, startLogin } from "../../src/core/pub/login.ts";
import { locateQuote } from "../../src/core/pub/quote.ts";
import { forgetKey, readKey, storeKey } from "../../src/core/pub/store.ts";
import { deckSource, requireUploadable } from "../../src/core/pub/version.ts";
import { resolveProject } from "../../src/core/resolve.ts";
import { answerOf, CommentList, paths } from "../../src/pub/protocol.ts";
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

  test("takes DEK_TOKEN over any key kept, for dek.pub or the server DEK_TOKEN_SERVER names", async () => {
    await withTempDir(async (dir) => {
      const env = { DEK_PUB_CREDENTIALS: join(dir, "credentials.json"), DEK_TOKEN: " ci " };
      await storeKey(DEFAULT_SERVER, "kept", env);
      await storeKey("https://a.example", "other", env);
      expect(await readKey(DEFAULT_SERVER, env)).toEqual({ key: "ci", source: "env" });
      expect(await readKey("https://a.example", env)).toEqual({ key: "other", source: "file" });
      const named = { ...env, DEK_TOKEN_SERVER: "https://a.example/" };
      expect(await readKey("https://a.example", named)).toEqual({ key: "ci", source: "env" });
      expect(await readKey(DEFAULT_SERVER, named)).toEqual({ key: "kept", source: "file" });
    });
  });

  test("says how to recover from a file that does not read", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "credentials.json");
      await Bun.write(path, "{");
      chmodSync(path, 0o600);
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
        clock: {
          now: () => Date.now(),
          sleep: async (ms) => {
            waits.push(ms);
          },
        },
      });
      expect(signedIn).toEqual({ status: "signed-in", me: fake.me, stored: "file" });
      // slow_down adds five seconds to every wait after it.
      expect(waits).toEqual([5000, 5000]);
      const file = JSON.parse(readFileSync(fake.credentials, "utf8"));
      expect(fake.keys.has(file.keys[fake.url])).toBe(true);
    });
  });

  test("stops waiting after its budget, and keeps the code for the next run", async () => {
    await withFakePub(async (fake) => {
      fake.pendingPolls = 100;
      fake.interval = 5;
      const login = await startLogin(fake.url);
      let now = Date.now();
      const answer = await awaitLogin(fake.url, login, {
        budgetMs: 60_000,
        clock: {
          now: () => now,
          sleep: async (ms) => {
            now += ms;
          },
        },
      });
      expect(answer).toEqual({
        status: "pending",
        url: login.url,
        code: login.userCode,
        expiresAt: login.expiresAt,
      });
      expect(existsSync(join(fake.credentials, "..", "login.json"))).toBe(true);
    });
  });

  test("gives up once the code would expire, and forgets it", async () => {
    await withFakePub(async (fake) => {
      fake.pendingPolls = 100;
      const login = await startLogin(fake.url);
      const later = Date.parse(login.expiresAt) + 1;
      await expect(
        awaitLogin(fake.url, login, { clock: { now: () => later, sleep: async () => {} } }),
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
});

describe("deckSlug", () => {
  test("lowercases a folder name to what dek.pub takes", () => {
    expect(deckSlug("2026-10_Why Dek!")).toBe("2026-10-why-dek");
    expect(deckSlug("発表")).toMatch(/^deck-[0-9a-f]{8}$/);
    expect(deckSlug("発表")).not.toBe(deckSlug("講演"));
    expect(deckSlug("a".repeat(80))).toHaveLength(63);
  });
});

describe("the protocol", () => {
  test("an answer may carry fields this dekc does not know, at any depth", () => {
    const row = {
      number: 1,
      id: "c_1",
      scope: "shared",
      slug: "intro",
      step: "0",
      status: "open",
      text: "t",
      targets: [{ kind: "quote", quote: "q", prefix: "", suffix: "", score: 1 }],
      author: { name: "Ann", handle: "ann", avatar: "x" },
      version: 1,
      url: "https://dek.pub/x",
      thread: [],
      createdAt: "2026-11-12T00:00:00.000Z",
      resolvedAt: null,
      reactions: 3,
    };
    expect(CommentList.safeParse({ comments: [row] }).success).toBe(false);
    const read = answerOf(CommentList).parse({ comments: [row], next: null });
    expect(read.comments[0]?.targets[0]).toEqual({
      kind: "quote",
      quote: "q",
      prefix: "",
      suffix: "",
    });
    expect(read.comments[0]?.author).toEqual({ name: "Ann", handle: "ann" });
    expect(() => answerOf(CommentList).parse({ comments: [{ ...row, status: "lost" }] })).toThrow();
  });

  test("puts each ID in its path as one segment", () => {
    expect(paths.replies("d_0123456789", "../../me")).toBe(
      "/api/decks/d_0123456789/comments/..%2F..%2Fme/replies",
    );
  });
});

describe("requireUploadable", () => {
  const file = (field: "full" | "source", mib: number) => ({
    field,
    bytes: new Uint8Array(mib * 1024 * 1024),
    type: "text/html",
    sha256: "",
  });

  test("passes a version within 50 MiB and names the largest parts of one past it", () => {
    expect(() =>
      requireUploadable({ files: [file("full", 20)], shots: undefined }, "/d"),
    ).not.toThrow();
    expect(() =>
      requireUploadable({ files: [file("full", 30), file("source", 25)], shots: [] }, "/d"),
    ).toThrow("the version is 55 MiB, and dek.pub takes 50 MiB at most");
  });
});
