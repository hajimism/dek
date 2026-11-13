import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { jsonStdout, runInProcess } from "../helpers/cli.ts";
import { type FakePub, withFakePub } from "../helpers/fake-pub.ts";

type Json = Record<string, unknown> & { ok: boolean };

async function pub(fake: FakePub, args: string[], cwd?: string) {
  return runInProcess(["pub", ...args], { cwd: cwd ?? tmpdir(), env: fake.env });
}

/** The fake's credentials file holding a key for `origin`, as a login leaves it. */
function signIn(fake: FakePub, origin = fake.url): string {
  const key = fake.issueKey();
  mkdirSync(dirname(fake.credentials), { recursive: true });
  writeFileSync(fake.credentials, JSON.stringify({ version: 1, keys: { [origin]: key } }), {
    mode: 0o600,
  });
  return key;
}

/** Nothing listens here, so a call to it fails at once. */
const CLOSED = "http://127.0.0.1:9";

describe("dekc pub login", () => {
  test.serial(
    "with --json prints the code at once, and the next run waits for it and signs in",
    async () => {
      await withFakePub(async (fake) => {
        const first = await pub(fake, ["login", "--json"]);
        expect(first.exitCode).toBe(0);
        const pending = jsonStdout<Json>(first);
        expect(pending).toMatchObject({
          ok: true,
          action: "login",
          status: "pending",
          server: fake.url,
          next: "dekc pub login --json",
        });
        expect(String(pending.url)).toContain(String(pending.code));
        expect(fake.keys.size).toBe(0);

        fake.pendingPolls = 1;
        const second = await pub(fake, ["login", "--json"]);
        expect(second.exitCode).toBe(0);
        expect(jsonStdout<Json>(second)).toEqual({
          ok: true,
          action: "login",
          server: fake.url,
          status: "signed-in",
          me: fake.me,
          stored: "file",
        });
        const file = JSON.parse(readFileSync(fake.credentials, "utf8"));
        expect(fake.keys.has(file.keys[fake.url])).toBe(true);
        expect(statSync(fake.credentials).mode & 0o777).toBe(0o600);
        expect(existsSync(join(fake.credentials, "..", "login.json"))).toBe(false);
        // Asked for one code, polled it twice, and traded the token for a key.
        expect(fake.requests.map((request) => request.path)).toEqual([
          "/api/auth/device/code",
          "/api/auth/device/token",
          "/api/auth/device/token",
          "/api/cli/key",
        ]);
        expect(fake.requests[3]?.headers.authorization).toMatch(/^Bearer at_/);
      });
    },
  );

  test.serial(
    "without --json says where to approve on stderr and waits in the same run",
    async () => {
      await withFakePub(async (fake) => {
        const result = await pub(fake, ["login"]);
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toMatch(
          /open http:\/\/127\.0\.0\.1:\d+\/device\?user_code=\S+ and enter/,
        );
        expect(result.stdout).toContain("signed in to");
        expect(result.stdout).toContain("@hajime");
      });
    },
  );

  test.serial("any other error on the code forgets it, with the way to sign in again", async () => {
    await withFakePub(async (fake) => {
      expect((await pub(fake, ["login", "--json"])).exitCode).toBe(0);
      fake.respond = (request) =>
        request.path === "/api/auth/device/token"
          ? Response.json({ error: "invalid_grant" }, { status: 400 })
          : undefined;
      const result = await pub(fake, ["login", "--json"]);
      expect(jsonStdout<Json>(result)).toMatchObject({
        ok: false,
        error: { hint: "run `dekc pub login` again, and approve the new code" },
      });
      expect(existsSync(join(fake.credentials, "..", "login.json"))).toBe(false);
    });
  });

  test.serial("warns when DEK_TOKEN will be sent instead of the key it kept", async () => {
    await withFakePub(async (fake) => {
      const env = { DEK_TOKEN: fake.issueKey(), DEK_TOKEN_SERVER: fake.url };
      await runInProcess(["pub", "login", "--json"], { cwd: tmpdir(), env });
      const result = await runInProcess(["pub", "login", "--json"], { cwd: tmpdir(), env });
      expect(jsonStdout<Json>(result)).toMatchObject({
        status: "signed-in",
        warning:
          "DEK_TOKEN is set for this server and is sent instead of the key login kept; unset DEK_TOKEN to use it",
      });
    });
  });

  test.serial(
    "a code turned down in the browser is forgotten, with the way to sign in again",
    async () => {
      await withFakePub(async (fake) => {
        fake.deny = true;
        const result = await pub(fake, ["login"]);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("the sign-in was turned down in the browser");
        expect(result.stderr).toContain("dekc pub login");
        expect(existsSync(join(fake.credentials, "..", "login.json"))).toBe(false);
      });
    },
  );
});

describe("dekc pub whoami and logout", () => {
  test.serial("whoami says who the kept key signs in as, sending it and the protocol", async () => {
    await withFakePub(async (fake) => {
      const key = signIn(fake);
      const result = await pub(fake, ["whoami", "--json"]);
      expect(jsonStdout<Json>(result)).toEqual({
        ok: true,
        action: "whoami",
        server: fake.url,
        me: fake.me,
        key: "file",
      });
      expect(fake.requests[0]?.headers["x-api-key"]).toBe(key);
      expect(fake.requests[0]?.headers["dek-protocol"]).toBe("1");
    });
  });

  test.serial(
    "whoami takes DEK_TOKEN over the kept key, for the server it is set for",
    async () => {
      await withFakePub(async (fake) => {
        const key = fake.issueKey();
        const result = await runInProcess(["pub", "whoami", "--json"], {
          cwd: tmpdir(),
          env: { DEK_TOKEN: key, DEK_TOKEN_SERVER: fake.url },
        });
        expect(jsonStdout<Json>(result)).toMatchObject({ ok: true, key: "env" });
      });
    },
  );

  test.serial("DEK_TOKEN goes only to dek.pub unless DEK_TOKEN_SERVER names another", async () => {
    await withFakePub(async (fake) => {
      const result = await runInProcess(["pub", "whoami", "--json"], {
        cwd: tmpdir(),
        env: { DEK_TOKEN: fake.issueKey() },
      });
      expect(jsonStdout<Json>(result)).toMatchObject({
        ok: false,
        error: { message: `not signed in to ${fake.url}` },
      });
      expect(fake.requests).toEqual([]);
    });
  });

  test.serial(
    "a key from DEK_TOKEN that the server refuses is said to be DEK_TOKEN's",
    async () => {
      await withFakePub(async (fake) => {
        const result = await runInProcess(["pub", "whoami", "--json"], {
          cwd: tmpdir(),
          env: { DEK_TOKEN: "k_stale", DEK_TOKEN_SERVER: fake.url },
        });
        expect(jsonStdout<Json>(result)).toMatchObject({
          ok: false,
          error: {
            hint: "the server does not take the key in DEK_TOKEN: replace it with a key that works, or unset DEK_TOKEN to use the one `dekc pub login` keeps",
          },
        });
      });
    },
  );

  test.serial("refuses a credentials file others may read", async () => {
    await withFakePub(async (fake) => {
      signIn(fake);
      chmodSync(fake.credentials, 0o644);
      const result = await pub(fake, ["whoami", "--json"]);
      expect(jsonStdout<Json>(result)).toMatchObject({
        ok: false,
        error: { message: `${fake.credentials} may be read or written by others` },
      });
    });
  });

  test.serial("logout of a key the server no longer knows forgets it and says so", async () => {
    await withFakePub(async (fake) => {
      const key = signIn(fake);
      fake.keys.delete(key);
      const result = await pub(fake, ["logout", "--json"]);
      expect(jsonStdout<Json>(result)).toEqual({
        ok: true,
        action: "logout",
        server: fake.url,
        revoked: false,
        forgotten: true,
        reason: "the server did not know the key, which no longer works",
      });
    });
  });

  test.serial("whoami with no key says how to sign in", async () => {
    await withFakePub(async (fake) => {
      const result = await pub(fake, ["whoami", "--json"]);
      expect(result.exitCode).toBe(1);
      expect(jsonStdout<Json>(result)).toEqual({
        ok: false,
        error: {
          message: `not signed in to ${fake.url}`,
          hint: "run `dekc pub login`; in CI, set DEK_TOKEN to an API key",
        },
      });
      expect(fake.requests).toEqual([]);
    });
  });

  test.serial("logout revokes the key on the server and forgets it", async () => {
    await withFakePub(async (fake) => {
      const key = signIn(fake);
      const result = await pub(fake, ["logout", "--json"]);
      expect(jsonStdout<Json>(result)).toEqual({
        ok: true,
        action: "logout",
        server: fake.url,
        revoked: true,
        forgotten: true,
      });
      expect(fake.keys.has(key)).toBe(false);
      expect(existsSync(fake.credentials)).toBe(false);
    });
  });

  test.serial(
    "logout forgets the key even when the server cannot be reached, and says so",
    async () => {
      await withFakePub(async (fake) => {
        signIn(fake, CLOSED);
        const result = await pub(fake, ["logout", "--json", "--server", CLOSED]);
        const json = jsonStdout<Json>(result);
        expect(json).toMatchObject({ ok: true, server: CLOSED, revoked: false, forgotten: true });
        expect(String(json.reason)).toContain(`could not reach ${CLOSED}`);
        expect(existsSync(fake.credentials)).toBe(false);
      });
    },
  );

  test.serial("a server that is down is no reason to keep the key", async () => {
    await withFakePub(async (fake) => {
      signIn(fake);
      fake.respond = () => new Response("down", { status: 503 });
      const result = await pub(fake, ["logout", "--json"]);
      const json = jsonStdout<Json>(result);
      expect(json).toMatchObject({ ok: true, revoked: false, forgotten: true });
      expect(String(json.reason)).toContain("the key still works until it is revoked on dek.pub");
    });
  });

  test.serial("--server must be HTTPS, or HTTP to this machine", async () => {
    const result = await runInProcess(
      ["pub", "whoami", "--json", "--server", "http://example.com"],
      {
        cwd: tmpdir(),
      },
    );
    expect(jsonStdout<Json>(result)).toMatchObject({
      ok: false,
      error: { message: '--server "http://example.com" is not served over HTTPS' },
    });
  });

  test.serial("a server that does not answer is named, with --server in the hint", async () => {
    await withFakePub(async (fake) => {
      signIn(fake, CLOSED);
      const result = await pub(fake, ["whoami", "--json", "--server", CLOSED]);
      expect(jsonStdout<Json>(result)).toMatchObject({
        ok: false,
        error: { message: `could not reach ${CLOSED} for your account` },
      });
      expect(result.stdout).toContain("--server <url>");
    });
  });
});
