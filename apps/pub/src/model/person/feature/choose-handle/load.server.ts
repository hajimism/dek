// The page a new account chooses its handle on: the handle it suggests, when someone may still
// choose it, and where to go after. Signed out, the page is the sign-in page's to show; with a
// handle chosen, there is nothing to do but go on.

import type { Context } from "hono";
import { sessionAccount } from "../../actor.server.ts";
import { suggestHandle } from "../../handle.ts";
import { safeNext, signInHref, welcomeHref } from "../../sign-in-path.ts";
import { personByHandle } from "../../store.server.ts";
import type { Welcome } from "./type.ts";

export async function loadWelcome(c: Context, asked: string | undefined): Promise<Welcome> {
  const next = safeNext(asked);
  const account = sessionAccount(c);
  if (!account) {
    return { redirect: signInHref(welcomeHref(next)) };
  }
  if (account.handle !== null) {
    return { redirect: next };
  }
  const suggested = suggestHandle(account);
  const free = suggested !== null && (await personByHandle(c, suggested)) === null;
  return { next, suggestion: free ? suggested : null };
}
