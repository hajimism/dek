// A grant lets one person other than the owner open, or comment on, a deck that is not public,
// on the team's side of the work or the guests'. Its role and side, and the grant as the owner's
// list shows it, are the protocol's `GrantRole`, `GrantSide` and `Grant`.

import type { grants } from "@schema";

export type GrantRow = typeof grants.$inferSelect;

/** Whom a grant names: an account by its handle, or an email address no account has yet. */
export type Grantee = { handle: string } | { email: string };
