import { z } from "zod";
import { CLI_CLIENT_ID, CliKey, type Me, paths } from "../../pub/protocol.ts";
import { DekError } from "../error.ts";
import { failure, request, send, unreadable } from "./client.ts";
import {
  type KeySource,
  type PendingLogin,
  readPendingLogin,
  storeKey,
  writePendingLogin,
} from "./store.ts";

/**
 * Signing in with OAuth 2.0's device authorization grant (RFC 8628), as Better Auth's device
 * plugin serves it: dek asks for a code, a person approves it in a browser, and dek, which polls
 * until then, trades the token it gets for an API key of its own. The code is kept in the user's
 * config folder while it waits, so a run that stops, as an agent's does after printing the code,
 * leaves the next run to wait for the same approval (ADR 47).
 */

const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

/** RFC 8628's default wait between polls, and what `slow_down` adds to it. */
const DEFAULT_INTERVAL_S = 5;
const SLOW_DOWN_S = 5;

const DeviceCode = z.object({
  device_code: z.string(),
  user_code: z.string(),
  verification_uri: z.string(),
  verification_uri_complete: z.string().optional(),
  expires_in: z.number(),
  interval: z.number().optional(),
});

const DeviceToken = z.object({ access_token: z.string() });

const DeviceError = z.object({ error: z.string(), error_description: z.string().optional() });

/** A sign-in that waits for its approval, as the CLI prints it. */
export type Pending = { status: "pending"; url: string; code: string; expiresAt: string };

export type SignedIn = { status: "signed-in"; me: Me; stored: Exclude<KeySource, "env"> };

/** The sign-in waiting for `origin`, unless it expired. */
export function pendingLogin(origin: string, now = new Date()): PendingLogin | undefined {
  const pending = readPendingLogin(origin);
  if (pending && Date.parse(pending.expiresAt) > now.getTime()) {
    return pending;
  }
  if (pending) {
    writePendingLogin(origin, undefined);
  }
  return undefined;
}

/** Ask `origin` for a code a person approves, and keep it for the runs that wait. */
export async function startLogin(origin: string, now = new Date()): Promise<PendingLogin> {
  const code = await request(
    origin,
    {
      method: "POST",
      path: paths.deviceCode,
      what: "a sign-in code",
      json: { client_id: CLI_CLIENT_ID },
    },
    DeviceCode,
  );
  const pending: PendingLogin = {
    deviceCode: code.device_code,
    userCode: code.user_code,
    url: code.verification_uri_complete ?? code.verification_uri,
    interval: code.interval ?? DEFAULT_INTERVAL_S,
    expiresAt: new Date(now.getTime() + code.expires_in * 1000).toISOString(),
  };
  writePendingLogin(origin, pending);
  return pending;
}

export function asPending(login: PendingLogin): Pending {
  return { status: "pending", url: login.url, code: login.userCode, expiresAt: login.expiresAt };
}

type Clock = { now: () => number; sleep: (ms: number) => Promise<void> };

const REAL_CLOCK: Clock = { now: () => Date.now(), sleep: (ms) => Bun.sleep(ms) };

/**
 * Poll until the code is approved, then keep the key the server gives for it. A denied or expired
 * code is forgotten, and the error says to sign in again.
 */
export async function awaitLogin(
  origin: string,
  login: PendingLogin,
  clock: Clock = REAL_CLOCK,
): Promise<SignedIn> {
  let interval = login.interval;
  const expires = Date.parse(login.expiresAt);
  for (;;) {
    const token = await pollToken(origin, login);
    if (token.kind === "token") {
      const issued = await request(
        origin,
        { method: "POST", path: paths.cliKey, what: "an API key", bearer: token.accessToken },
        CliKey,
      );
      const stored = await storeKey(origin, issued.key);
      writePendingLogin(origin, undefined);
      return { status: "signed-in", me: issued.me, stored };
    }
    if (token.kind === "denied" || token.kind === "expired") {
      writePendingLogin(origin, undefined);
      throw new DekError(
        token.kind === "denied"
          ? "the sign-in was turned down in the browser"
          : "the sign-in code expired before it was approved",
        { hint: "run `dekc pub login` again, and approve the new code" },
      );
    }
    if (token.kind === "slow") {
      interval += SLOW_DOWN_S;
    }
    if (clock.now() + interval * 1000 >= expires) {
      writePendingLogin(origin, undefined);
      throw new DekError("the sign-in code expired before it was approved", {
        hint: "run `dekc pub login` again, and approve the new code",
      });
    }
    await clock.sleep(interval * 1000);
  }
}

type Polled =
  | { kind: "token"; accessToken: string }
  | { kind: "pending" | "slow" | "denied" | "expired" };

async function pollToken(origin: string, login: PendingLogin): Promise<Polled> {
  const call = {
    method: "POST" as const,
    path: paths.deviceToken,
    what: "the sign-in's approval",
    json: { grant_type: DEVICE_GRANT, device_code: login.deviceCode, client_id: CLI_CLIENT_ID },
  };
  const response = await send(origin, call);
  const body: unknown = await response.json().catch(() => undefined);
  if (response.ok) {
    const token = DeviceToken.safeParse(body);
    if (!token.success) {
      throw unreadable(origin, call);
    }
    return { kind: "token", accessToken: token.data.access_token };
  }
  const error = DeviceError.safeParse(body);
  switch (error.success ? error.data.error : undefined) {
    case "authorization_pending":
      return { kind: "pending" };
    case "slow_down":
      return { kind: "slow" };
    case "access_denied":
      return { kind: "denied" };
    case "expired_token":
      return { kind: "expired" };
    default:
      throw failure(response.status, body, origin, call);
  }
}
