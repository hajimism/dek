// A grant lets one person other than the owner open, or comment on, a deck that is not public,
// on the team's side of the work or the client's.

import type { grants } from "@schema";
import type { z } from "zod";
import type {
  Grant,
  GrantRole as Role,
  GrantSide as Side,
} from "../../../../../../src/pub/protocol.ts";

export type GrantRow = typeof grants.$inferSelect;
export type GrantRole = z.infer<typeof Role>;
export type GrantSide = z.infer<typeof Side>;

/** A grant as the owner's list shows it, and as GET /api/decks/:id/grants answers. */
export type GrantView = z.infer<typeof Grant>;

/** Whom a grant names: an account by its handle, or an email address no account has yet. */
export type Grantee = { handle: string } | { email: string };
