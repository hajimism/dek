// Who is calling: the account signed in through the browser's session, or the one an API key
// belongs to. An account may read before its holder has chosen a handle, but nothing it does
// as a Person, writing or making a key, gets past `currentPerson` until then (ADR 77). What only
// the person themself should do, an API key cannot: `requireSessionPerson` (ADR 83).

import type { Context } from "hono";
import { API_KEY_HEADER, HANDLE_NEEDED, SESSION_NEEDED } from "../../../../../src/pub/protocol.ts";
import { ApiError } from "../../common/api-error.ts";
import { appUrl } from "../../common/http.server.ts";
import { checkKey } from "./api-key.server.ts";
import { hasHandle, readAccount } from "./person.ts";
import { accountById } from "./store.server.ts";
import type { Account, Person } from "./type.ts";

/** The account signed in through the browser's session; an API key is not asked. */
export function sessionAccount(c: Context): Account | null {
  const user = c.get("user");
  return user ? readAccount(user) : null;
}

export async function currentAccount(c: Context): Promise<Account | null> {
  if (c.get("user")) {
    return sessionAccount(c);
  }
  const key = c.req.header(API_KEY_HEADER);
  if (!key) {
    return null;
  }
  const checked = await checkKey(c, key);
  if (!checked) {
    throw new ApiError(401, "bad_key", "the API key is not valid", "run `dekc pub login` again");
  }
  const found = await accountById(c, checked.userId);
  if (!found) {
    throw new ApiError(
      401,
      "bad_key",
      "the API key's account is gone",
      "run `dekc pub login` again",
    );
  }
  return found;
}

/** The account calling, or null for a page that renders for anyone, whatever a bad key says. */
export async function viewerOf(c: Context): Promise<Account | null> {
  return currentAccount(c).catch(() => null);
}

/** The person calling, or null when no one is signed in; an account with no handle is refused. */
export async function currentPerson(c: Context): Promise<Person | null> {
  const account = await currentAccount(c);
  if (account === null || hasHandle(account)) {
    return account;
  }
  throw new ApiError(
    409,
    HANDLE_NEEDED,
    "choose a handle on dek.pub first",
    `open ${appUrl("/welcome")} to choose one`,
  );
}

export async function requirePerson(c: Context): Promise<Person> {
  const found = await currentPerson(c);
  if (!found) {
    throw new ApiError(401, "signed_out", "sign in first", "run `dekc pub login`");
  }
  return found;
}

/**
 * The person signed in through the browser's session, for what an API key may not do: change
 * their settings, list their keys, or revoke one other than itself. A key that leaks can then
 * neither see the person's machines nor change who they are on dek.pub.
 */
export async function requireSessionPerson(c: Context): Promise<Person> {
  if (!c.get("user") && c.req.header(API_KEY_HEADER)) {
    throw new ApiError(
      403,
      SESSION_NEEDED,
      "an API key cannot do this; it is done signed in on dek.pub",
      `open ${appUrl("/settings")} in a browser`,
    );
  }
  return requirePerson(c);
}
