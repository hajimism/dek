// Who may sign up, as an operator invites them from the settings page (ADR 85): the entries, each
// an address or `@<GitHub login>`, listed, added and removed. Adding an address mails it an
// invitation with a link to sign in; a login has no address to mail. Only an operator signed in
// through the browser may, and everyone else, an API key or anyone signed out included, gets the
// 404 of a route that does not exist, so nothing tells them there is one.

import type { Context } from "hono";
import {
  NewSignUpInvites,
  type SignUpInvite,
  type SignUpInvites,
} from "../../../../../../../src/pub/protocol.ts";
import { ApiError, notFound } from "../../../../common/api-error.ts";
import { afterAnswer, appUrl, jsonBody } from "../../../../common/http.server.ts";
import { sendMail } from "../../../../common/mail.server.ts";
import { sessionAccount } from "../../actor.server.ts";
import { isOperator } from "../../operator.server.ts";
import { hasHandle } from "../../person.ts";
import {
  addSignUpInvites,
  removeSignUpInvite,
  signUpInvitesAll,
} from "../../sign-up-invite.server.ts";
import { isLoginEntry, MAX_INVITES_PER_ADD, readInviteEntries } from "../../sign-up-invite.ts";
import { peopleById } from "../../store.server.ts";
import type { Account, Person, SignUpInviteRow } from "../../type.ts";
import { inviteMail } from "./invite-mail.ts";
import { INVITE_CODES } from "./type.ts";

/** Whether `account` may manage who signs up: an operator with a handle, signed in. */
function managesInvites(account: Account | null): account is Person {
  return account !== null && hasHandle(account) && isOperator(account);
}

/** The operator signed in through the browser's session; for anyone else, a 404. */
function sessionOperator(c: Context): Person {
  const account = sessionAccount(c);
  if (!managesInvites(account)) {
    throw notFound("page");
  }
  return account;
}

/** The entries as the page shows them, with the handles of who added each and who came in by it. */
async function invitesOf(c: Context): Promise<SignUpInvite[]> {
  const rows = await signUpInvitesAll();
  const people = await peopleById(
    c,
    rows.flatMap((row: SignUpInviteRow) => [
      row.addedBy,
      ...(row.claimedBy ? [row.claimedBy] : []),
    ]),
  );
  return rows.map((row) => ({
    id: row.id,
    entry: row.entry,
    addedAt: row.createdAt,
    addedBy: people.get(row.addedBy)?.handle ?? null,
    claimedAt: row.claimedAt,
    claimedBy: (row.claimedBy && people.get(row.claimedBy)?.handle) || null,
  }));
}

/** For the settings page's loader: the entries for an operator, and null for anyone else. */
export async function invitesFor(c: Context, account: Account): Promise<SignUpInvite[] | null> {
  return managesInvites(account) ? invitesOf(c) : null;
}

export async function listInvites(c: Context): Promise<SignUpInvites> {
  sessionOperator(c);
  return { invites: await invitesOf(c) };
}

/**
 * Add the entries the request's body names, protocol NewSignUpInvites, all or none, and mail each
 * new address its invitation after the answer. An entry there already is left as it was and mailed
 * nothing again. The body is read only once the caller is known to be an operator, so no one else
 * learns from how it is refused that the route is there.
 */
export async function addInvites(c: Context): Promise<SignUpInvites> {
  const operator = sessionOperator(c);
  const read = readInviteEntries((await jsonBody(c, NewSignUpInvites)).entries);
  if (!read.ok) {
    throw new ApiError(
      422,
      INVITE_CODES[read.problem],
      read.problem === "invalid"
        ? `“${read.entry}” is neither an email address nor @ and a GitHub login`
        : read.problem === "empty"
          ? "name an address or a GitHub login to invite"
          : `one add takes up to ${MAX_INVITES_PER_ADD} entries`,
    );
  }
  const added = await addSignUpInvites(read.entries, operator.id);
  const signIn = appUrl("/signin");
  afterAnswer(
    c,
    Promise.all(
      added.filter((entry) => !isLoginEntry(entry)).map((to) => sendMail(inviteMail(to, signIn))),
    ),
  );
  return { invites: await invitesOf(c) };
}

/** Remove an entry no account was made from; one that has been is kept, as the record of it. */
export async function removeInvite(c: Context, id: string): Promise<SignUpInvites> {
  sessionOperator(c);
  const removed = await removeSignUpInvite(id);
  if (removed === "missing") {
    throw new ApiError(404, "invite_not_found", "no such invitation");
  }
  if (removed === "claimed") {
    throw new ApiError(
      409,
      INVITE_CODES.claimed,
      "an account was made from this invitation, so it stays",
    );
  }
  return { invites: await invitesOf(c) };
}
