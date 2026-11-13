// Who is calling: the person signed in through the browser's session, or the one an API key
// belongs to. The key is checked here, with Better Auth's api-key plugin, rather than turned into
// a session for every endpoint, so only dek.pub's own API accepts it.

import type { Context } from "hono";
import { API_KEY_HEADER } from "../../../../../../../src/pub/protocol.ts";
import { ApiError } from "../../../../common/http.server.ts";
import { authOf } from "../../../../common/void-auth.server.ts";
import type { Person } from "../../../deck/access.ts";

type UserRow = {
  id: string;
  name: string;
  email?: string;
  emailVerified?: boolean;
  handle?: string | null;
};

function person(user: UserRow): Person {
  return {
    id: user.id,
    name: user.name,
    handle: user.handle ?? user.id,
    ...(user.email ? { email: user.email, emailVerified: user.emailVerified === true } : {}),
  };
}

export async function currentPerson(c: Context): Promise<Person | null> {
  const user = c.get("user") as UserRow | null | undefined;
  if (user) {
    return person(user);
  }
  const key = c.req.header(API_KEY_HEADER);
  if (!key) {
    return null;
  }
  const auth = authOf(c);
  const result = (await auth.api.verifyApiKey({ body: { key } })) as {
    valid: boolean;
    key?: { referenceId?: string; userId?: string } | null;
  };
  const userId = result.valid ? (result.key?.referenceId ?? result.key?.userId) : undefined;
  if (!userId) {
    throw new ApiError(401, "bad_key", "the API key is not valid", "run `dekc pub login` again");
  }
  const context = await auth.$context;
  const found = (await context.internalAdapter.findUserById(userId)) as UserRow | null;
  if (!found) {
    throw new ApiError(
      401,
      "bad_key",
      "the API key's account is gone",
      "run `dekc pub login` again",
    );
  }
  return person(found);
}

export async function requirePerson(c: Context): Promise<Person> {
  const found = await currentPerson(c);
  if (!found) {
    throw new ApiError(401, "signed_out", "sign in first", "run `dekc pub login`");
  }
  return found;
}
