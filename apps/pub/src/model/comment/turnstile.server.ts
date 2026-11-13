// Turnstile stands between a guest and the comment box. The secret `off` turns the check off, for
// a machine with no network to Cloudflare, such as a test run; the deployed app has a real one.

import { env } from "void/env";
import { ApiError } from "../../common/api-error.ts";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function checkGuest(token: string | undefined, ip: string | undefined): Promise<void> {
  if (env.TURNSTILE_SECRET === "off") {
    // Off only where development sign-in is on too: a deployed app never runs without the check.
    if (env.DEK_PUB_DEV_LOGIN === "1") {
      return;
    }
    throw new Error("TURNSTILE_SECRET is off outside development");
  }
  if (!token) {
    throw new ApiError(
      422,
      "turnstile",
      "the human check is missing",
      "reload the page and try again",
    );
  }
  const body = new FormData();
  body.set("secret", env.TURNSTILE_SECRET);
  body.set("response", token);
  if (ip) {
    body.set("remoteip", ip);
  }
  // biome-ignore lint/style/noRestrictedGlobals: the check gives up after five seconds.
  const response = await fetch(VERIFY_URL, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(5000),
  });
  const result = (await response.json()) as { success?: boolean };
  if (!result.success) {
    throw new ApiError(
      422,
      "turnstile",
      "the human check did not pass",
      "reload the page and try again",
    );
  }
}
