// The people who run dek.pub, as `DEK_PUB_OPERATORS` names them by verified address. An operator
// may delete anyone's talk, for a takedown, may make an account though nobody invited them, and
// may invite others to sign up from /settings; nothing else is theirs to do (ADR 82, 85).

import { isAddressEntry, listSetting } from "../../common/list-setting.ts";

/**
 * The addresses `DEK_PUB_OPERATORS` holds: entries split by commas or whitespace, in lowercase.
 * Any other entry counts for nothing: a handle, which whoever comes first
 * may take, and `@<GitHub login>`, which GitHub lets be renamed and taken by someone else.
 */
export function readOperators(setting: string): ReadonlySet<string> {
  return new Set(listSetting(setting).filter(isAddressEntry));
}

/** Whether `operators` names the holder of `account`: its address is listed and verified. */
export function namesOperator(
  operators: ReadonlySet<string>,
  account: { email: string; emailVerified: boolean },
): boolean {
  return account.emailVerified && operators.has(account.email.toLowerCase());
}
