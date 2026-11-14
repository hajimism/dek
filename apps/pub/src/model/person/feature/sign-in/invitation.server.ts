// Holding sign-up to the people dek.pub has invited, as `DEK_PUB_INVITED` lists them, and to those
// a deck is shared with by address (ADR 79).

import { env } from "void/env";
import { hasWaitingGrant } from "../../../deck/grant/store.server.ts";
import { mayJoin, readInvited } from "../../invited.ts";
import type { Newcomer } from "../../type.ts";

/** Whether dek.pub may make an account for `newcomer`, who has none yet. */
export function mayMakeAccount(newcomer: Newcomer): Promise<boolean> {
  return mayJoin(readInvited(env.DEK_PUB_INVITED), newcomer, hasWaitingGrant);
}
