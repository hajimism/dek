import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { type FakePub, withFakePub } from "../helpers/fake-pub.ts";

type Json = Record<string, unknown> & { ok: boolean };

async function pub(fake: FakePub, args: string[], cwd?: string) {
  return runDek(["pub", ...args], { ...(cwd ? { cwd } : {}), env: fake.env });
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
  test("with --json prints the code at once, and the next run waits for it and signs in", async () => {
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
  });

  test("without --json says where to approve on stderr and waits in the same run", async () => {
    await withFakePub(async (fake) => {
      const result = await pub(fake, ["login"]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toMatch(
        /open http:\/\/127\.0\.0\.1:\d+\/device\?user_code=\S+ and enter/,
      );
      expect(result.stdout).toContain("signed in to");
      expect(result.stdout).toContain("@hajime");
    });
  });

  test("a code turned down in the browser is forgotten, with the way to sign in again", async () => {
    await withFakePub(async (fake) => {
      fake.deny = true;
      const result = await pub(fake, ["login"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("the sign-in was turned down in the browser");
      expect(result.stderr).toContain("dekc pub login");
      expect(existsSync(join(fake.credentials, "..", "login.json"))).toBe(false);
    });
  });
});

describe("dekc pub whoami and logout", () => {
  test("whoami says who the kept key signs in as, sending it and the protocol", async () => {
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

  test("whoami takes DEK_TOKEN over the kept key", async () => {
    await withFakePub(async (fake) => {
      const key = fake.issueKey();
      const result = await runDek(["pub", "whoami", "--json"], {
        env: { ...fake.env, DEK_TOKEN: key },
      });
      expect(jsonStdout<Json>(result)).toMatchObject({ ok: true, key: "env" });
    });
  });

  test("whoami with no key says how to sign in", async () => {
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

  test("logout revokes the key on the server and forgets it", async () => {
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

  test("logout forgets the key even when the server cannot be reached, and says so", async () => {
    await withFakePub(async (fake) => {
      signIn(fake, CLOSED);
      const result = await pub(fake, ["logout", "--json", "--server", CLOSED]);
      const json = jsonStdout<Json>(result);
      expect(json).toMatchObject({ ok: true, server: CLOSED, revoked: false, forgotten: true });
      expect(String(json.reason)).toContain(`could not reach ${CLOSED}`);
      expect(existsSync(fake.credentials)).toBe(false);
    });
  });

  test("a server that is down is no reason to keep the key", async () => {
    await withFakePub(async (fake) => {
      signIn(fake);
      fake.respond = () => new Response("down", { status: 503 });
      const result = await pub(fake, ["logout", "--json"]);
      const json = jsonStdout<Json>(result);
      expect(json).toMatchObject({ ok: true, revoked: false, forgotten: true });
      expect(String(json.reason)).toContain("the key still works until it is revoked on dek.pub");
    });
  });

  test("--server must be HTTPS, or HTTP to this machine", async () => {
    const result = await runDek(["pub", "whoami", "--json", "--server", "http://example.com"]);
    expect(jsonStdout<Json>(result)).toMatchObject({
      ok: false,
      error: { message: '--server "http://example.com" is not served over HTTPS' },
    });
  });

  test("a server that does not answer is named, with --server in the hint", async () => {
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
