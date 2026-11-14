// The people who run dek.pub, as `DEK_PUB_OPERATORS` names them by handle. An operator may delete
// anyone's talk, for a takedown; nothing else is theirs to do (ADR 82).

import { listSetting } from "../../common/list-setting.ts";
import { isHandle } from "./handle.ts";

/**
 * The handles `DEK_PUB_OPERATORS` holds: entries split by commas or whitespace, as
 * `DEK_PUB_INVITED`'s are, each a handle with or without its `@`. Any other entry counts for
 * nothing.
 */
export function readOperators(setting: string): ReadonlySet<string> {
  return new Set(
    listSetting(setting)
      .map((entry) => entry.replace(/^@/, ""))
      .filter(isHandle),
  );
}
