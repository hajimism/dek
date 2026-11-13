// Who is calling: the person signed in through the browser's session, or the one an API key
// belongs to.

import type { Context } from "hono";
import { API_KEY_HEADER } from "../../../../../src/pub/protocol.ts";
import { ApiError } from "../../common/api-error.ts";
import { checkKey } from "./api-key.server.ts";
import { personById } from "./store.server.ts";
import { Account, type Person } from "./type.ts";

export async function currentPerson(c: Context): Promise<Person | null> {
  const user = c.get("user");
  if (user) {
    return Account.parse(user);
  }
  const key = c.req.header(API_KEY_HEADER);
  if (!key) {
    return null;
  }
  const checked = await checkKey(c, key);
  if (!checked) {
    throw new ApiError(401, "bad_key", "the API key is not valid", "run `dekc pub login` again");
  }
  const found = await personById(c, checked.userId);
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

/** The person calling, or null for a page that renders for anyone, whatever a bad key says. */
export async function viewerOf(c: Context): Promise<Person | null> {
  return currentPerson(c).catch(() => null);
}

export async function requirePerson(c: Context): Promise<Person> {
  const found = await currentPerson(c);
  if (!found) {
    throw new ApiError(401, "signed_out", "sign in first", "run `dekc pub login`");
  }
  return found;
}
