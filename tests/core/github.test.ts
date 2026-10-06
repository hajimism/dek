import { describe, expect, test } from "bun:test";
import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { authorization, downloadTarball, resolveRev } from "../../src/core/github.ts";
import { withEnv } from "../helpers/env.ts";
import { deckRepoFiles, SHA_A, SHA_B, withFakeGithub } from "../helpers/fake-github.ts";
import { withTempDir } from "../helpers/fs.ts";

const repos = {
  "someone/talks": {
    head: SHA_A,
    revs: { v1: SHA_B },
    commits: { [SHA_A]: deckRepoFiles("why-dek"), [SHA_B]: deckRepoFiles("why-dek") },
  },
};

describe("resolveRev", () => {
  test.serial("resolves the default branch, a tag, and a sha to a full sha", async () => {
    await withFakeGithub(repos, async () => {
      expect(await resolveRev("someone", "talks")).toBe(SHA_A);
      expect(await resolveRev("someone", "talks", "v1")).toBe(SHA_B);
      expect(await resolveRev("someone", "talks", SHA_B)).toBe(SHA_B);
    });
  });

  test.serial("a missing repo or rev says a token goes only to api.github.com", async () => {
    await withFakeGithub(repos, async () => {
      await expect(resolveRev("someone", "nope")).rejects.toMatchObject({
        message: "someone/nope not found on GitHub",
        hint: expect.stringMatching(/DEK_GITHUB_API.*api\.github\.com/),
      });
      await expect(resolveRev("someone", "talks", "v9")).rejects.toMatchObject({
        message: "someone/talks@v9 not found on GitHub",
      });
    });
  });

  test.serial("a rate limit points to a token", async () => {
    await withFakeGithub(repos, async (fake) => {
      fake.failWith = { status: 403, headers: { "x-ratelimit-remaining": "0" } };
      await expect(resolveRev("someone", "talks")).rejects.toMatchObject({
        message: expect.stringContaining("rate limit"),
        hint: expect.stringContaining("GITHUB_TOKEN"),
      });
    });
  });

  test.serial("a secondary rate limit with retry-after says how long to wait", async () => {
    await withFakeGithub(repos, async (fake) => {
      fake.failWith = { status: 403, headers: { "retry-after": "30" } };
      await expect(resolveRev("someone", "talks")).rejects.toMatchObject({
        message: expect.stringContaining("rate limit"),
        hint: expect.stringMatching(/30s.*GITHUB_TOKEN/),
      });
    });
  });

  test.serial("a GitHub that never answers times out with a message, not a hang", async () => {
    await withFakeGithub(repos, async (fake) => {
      fake.hang = true;
      await expect(
        resolveRev("someone", "talks", undefined, { timeoutMs: 50 }),
      ).rejects.toMatchObject({
        name: "DekError",
        message: "GitHub timed out after 0.05s while fetching someone/talks",
        hint: expect.stringContaining("run the command again"),
      });
    });
  });

  test.serial("an unreachable GitHub says so instead of failing silently", async () => {
    await withFakeGithub(repos, async () => {
      await withEnv({ DEK_GITHUB_API: "http://127.0.0.1:1" }, async () => {
        await expect(resolveRev("someone", "talks")).rejects.toMatchObject({
          message: expect.stringContaining("could not reach GitHub"),
          hint: expect.stringContaining("network"),
        });
      });
    });
  });
});

describe("authentication", () => {
  test("sends GITHUB_TOKEN, else GH_TOKEN, as a bearer token to api.github.com", () => {
    const api = "https://api.github.com";
    expect(authorization(api, { GITHUB_TOKEN: "from-github", GH_TOKEN: "from-gh" })).toBe(
      "Bearer from-github",
    );
    expect(authorization(api, { GH_TOKEN: " from-gh \n" })).toBe("Bearer from-gh");
    expect(authorization(api, { GITHUB_TOKEN: "", GH_TOKEN: "" })).toBeUndefined();
    expect(authorization(api, {})).toBeUndefined();
  });

  test("sends no token to any other API", () => {
    for (const base of [
      "http://127.0.0.1:8080",
      "https://api.github.com.example",
      "https://github.com",
    ]) {
      expect(authorization(base, { GITHUB_TOKEN: "secret", GH_TOKEN: "secret" })).toBeUndefined();
    }
  });

  test.serial("a token set for GitHub never reaches DEK_GITHUB_API", async () => {
    await withFakeGithub(
      repos,
      async (fake) => {
        await resolveRev("someone", "talks");
        await downloadTarball("someone", "talks", SHA_A);
        expect(fake.requests.map((request) => request.authorization)).toEqual([null, null, null]);
      },
      { GITHUB_TOKEN: "secret", GH_TOKEN: "secret" },
    );
  });

  test.serial("never asks gh for a token", async () => {
    await withTempDir(async (dir) => {
      const asked = join(dir, "asked");
      const gh = join(dir, "gh");
      await writeFile(gh, `#!/bin/sh\ntouch '${asked}'\necho from-gh\n`);
      await chmod(gh, 0o755);
      await withFakeGithub(
        repos,
        async (fake) => {
          await resolveRev("someone", "talks");
          expect(fake.requests[0]?.authorization).toBeNull();
        },
        { PATH: `${dir}:${process.env.PATH ?? ""}`, DEK_GH: gh },
      );
      expect(await Bun.file(asked).exists()).toBe(false);
    });
  });
});

describe("downloadTarball", () => {
  test.serial("follows the redirect and returns the repository at that commit", async () => {
    await withFakeGithub(repos, async () => {
      const files = await new Bun.Archive(await downloadTarball("someone", "talks", SHA_A)).files();
      expect([...files.keys()]).toContain(`someone-talks-aaaaaaa/decks/why-dek/script.md`);
    });
  });

  test.serial("stops reading a chunked tarball as soon as it passes the size cap", async () => {
    await withFakeGithub(repos, async (fake) => {
      // A body that never ends: the download can only fail by giving up on it.
      let cancelled = false;
      fake.tarballBytes = () =>
        new ReadableStream<Uint8Array>({
          async pull(controller) {
            await Bun.sleep(1);
            controller.enqueue(new Uint8Array(1024));
          },
          cancel() {
            cancelled = true;
          },
        });
      await expect(
        downloadTarball("someone", "talks", SHA_A, { maxBytes: 4096 }),
      ).rejects.toMatchObject({
        name: "DekError",
        message: expect.stringContaining("is larger than"),
        hint: expect.stringContaining("smaller repository"),
      });
      for (let i = 0; i < 50 && !cancelled; i++) {
        await Bun.sleep(10);
      }
      expect(cancelled).toBe(true);
    });
  });

  test.serial("a tarball that stalls times out instead of hanging", async () => {
    await withFakeGithub(repos, async (fake) => {
      fake.tarballBytes = () =>
        new ReadableStream<Uint8Array>({ pull: () => new Promise(() => {}) });
      await expect(
        downloadTarball("someone", "talks", SHA_A, { timeoutMs: 50 }),
      ).rejects.toMatchObject({
        name: "DekError",
        message: "GitHub timed out after 0.05s while fetching someone/talks@aaaaaaa",
      });
    });
  });
});
