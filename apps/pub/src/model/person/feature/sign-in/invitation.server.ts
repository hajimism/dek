// Holding sign-up to the people an operator has invited from /settings (ADR 85), to those a deck is
// shared with by address (ADR 79), and to the operators (ADR 82); anyone, only where sign-up is open.

import { env } from "void/env";
import { hasWaitingGrant } from "../../../deck/grant/store.server.ts";
import { mayJoin, signUpIsOpen } from "../../invited.ts";
import { readOperators } from "../../operator.ts";
import { hasOpenSignUpInvite } from "../../sign-up-invite.server.ts";
import type { Newcomer } from "../../type.ts";

/** Whether dek.pub may make an account for `newcomer`, who has none yet. */
export function mayMakeAccount(newcomer: Newcomer): Promise<boolean> {
  return mayJoin(newcomer, {
    open: signUpIsOpen(env),
    operators: readOperators(env.DEK_PUB_OPERATORS),
    invited: hasOpenSignUpInvite,
    grantWaits: hasWaitingGrant,
  });
}
