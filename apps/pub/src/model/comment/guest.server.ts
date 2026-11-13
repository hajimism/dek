// A guest may comment where the deck's policy lets guests in: with a name, and past Turnstile.

import type { Context } from "hono";
import { ApiError } from "../../common/api-error.ts";
import type { Person } from "../person/type.ts";
import { checkGuest } from "./turnstile.server.ts";

/** Let a signed-out writer through, or refuse them; anyone signed in passes. */
export async function admitGuest(
  c: Context,
  person: Person | null,
  body: { guestName?: string; turnstile?: string },
  what: "comment" | "reply",
): Promise<void> {
  if (person) {
    return;
  }
  if (!body.guestName) {
    throw new ApiError(422, "guest_name", `a guest ${what} needs a name`);
  }
  await checkGuest(body.turnstile, c.req.header("cf-connecting-ip"));
}
