// Whether a handle may be chosen, and choosing it: once, by an account that has none, through
// this alone, since no API of Better Auth's may write the handle (ADR 77).

import type { Context } from "hono";
import type { HandleStatus, Me } from "../../../../../../../src/pub/protocol.ts";
import { ApiError } from "../../../../common/api-error.ts";
import { currentAccount } from "../../actor.server.ts";
import { handleProblem, normalizeHandle } from "../../handle.ts";
import { meOf } from "../../person.ts";
import { personByHandle, setHandle } from "../../store.server.ts";
import type { Account } from "../../type.ts";

/** Whether `value`, read as a handle, may be chosen now. */
async function handleStatus(c: Context, value: string): Promise<HandleStatus> {
  const handle = normalizeHandle(value);
  const problem = handleProblem(handle);
  if (problem) {
    return { handle, status: problem };
  }
  return { handle, status: (await personByHandle(c, handle)) ? "taken" : "free" };
}

async function signedIn(c: Context): Promise<Account> {
  const account = await currentAccount(c);
  if (!account) {
    throw new ApiError(401, "signed_out", "sign in first");
  }
  return account;
}

/** `handleStatus`, for an account signed in: the page to choose one is the only one that asks. */
export async function askHandle(c: Context, value: string): Promise<HandleStatus> {
  await signedIn(c);
  return handleStatus(c, value);
}

const chosenAlready = (): ApiError =>
  new ApiError(
    409,
    "handle_chosen",
    "you have chosen your handle already",
    "a handle cannot be changed",
  );

/** Give the account calling the handle it chose; refused once it has one. */
export async function chooseHandle(c: Context, value: string): Promise<Me> {
  const account = await signedIn(c);
  if (account.handle !== null) {
    throw chosenAlready();
  }
  const { handle, status } = await handleStatus(c, value);
  if (status === "invalid") {
    throw new ApiError(
      422,
      "handle_invalid",
      "a handle is lowercase letters, digits and single hyphens, up to 39, with no hyphen at either end",
    );
  }
  if (status === "reserved") {
    throw new ApiError(422, "handle_reserved", `@${handle} is kept for dek.pub`);
  }
  const taken = new ApiError(409, "handle_taken", `@${handle} is taken`, "choose another");
  if (status === "taken") {
    throw taken;
  }
  const result = await setHandle(c, account.id, handle);
  if (result === "taken") {
    throw taken;
  }
  if (result === "chosen") {
    throw chosenAlready();
  }
  return meOf({ ...account, handle });
}
