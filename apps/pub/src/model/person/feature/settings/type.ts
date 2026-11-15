// A person's settings, on /settings: their handle, which stays, the name everyone sees them by,
// the links their profile shows (ADR 78), the CLI keys they hold (ADR 83), and, for an operator,
// who may sign up (ADR 85).

import type { CliKeyInfo, SignUpInvite } from "../../../../../../../src/pub/protocol.ts";
import type { LinksProblem } from "../../link.ts";
import type { NameProblem } from "../../name.ts";
import type { InvitesProblem } from "../../sign-up-invite.ts";

/**
 * The settings page as its person sees it, with the entries of who may sign up for an operator and
 * null for anyone else; or where to go instead, signed out or with no handle yet.
 */
export type Settings =
  | {
      handle: string;
      name: string;
      links: string[];
      keys: CliKeyInfo[];
      invites: SignUpInvite[] | null;
    }
  | { redirect: string };

/** The error code the API answers each problem with a list of links with. */
export const LINK_CODES = {
  invalid: "link_invalid",
  not_https: "link_not_https",
  credentials: "link_credentials",
  too_long: "link_too_long",
  duplicate: "link_duplicate",
  too_many: "links_too_many",
} as const satisfies Record<LinksProblem, string>;

/** The error code the API answers each problem with a name with. */
export const NAME_CODES = {
  empty: "name_empty",
  too_long: "name_too_long",
} as const satisfies Record<NameProblem, string>;

/** The error code the API answers each problem with a list of entries, or a removal, with. */
export const INVITE_CODES = {
  invalid: "invite_invalid",
  empty: "invites_empty",
  too_many: "invites_too_many",
  claimed: "invite_claimed",
} as const satisfies Record<InvitesProblem["problem"] | "claimed", string>;

/** Why a save did not happen, beyond what the rules say: dek.pub was not reached, or it failed. */
export type SaveFailure = "offline" | "failed";

/** A save done, with what was saved; or not, and why. */
export type Saved<T, Problem extends string> =
  | { ok: true; value: T }
  | { ok: false; problem: Problem | SaveFailure; message: string };
