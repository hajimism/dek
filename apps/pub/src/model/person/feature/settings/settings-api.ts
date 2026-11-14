// The settings page's calls: saving the links and the name, revoking CLI keys, and, for an
// operator, adding and removing who may sign up. The paths are protocol `paths.myLinks`,
// `paths.me`, `paths.myKey`, `paths.myKeys`, `paths.invites` and `paths.invite`, written out, as
// the protocol module brings zod with it.

import type {
  KeysRevoked,
  Me,
  ProfileLinks,
  SignUpInvite,
  SignUpInvites,
} from "../../../../../../../src/pub/protocol.ts";
import { ApiFailure, api } from "../../../../common/ui/api.ts";
import type { LinksProblem } from "../../link.ts";
import type { NameProblem } from "../../name.ts";
import { LINK_CODES, NAME_CODES, type Saved } from "./type.ts";

/** The problem `codes` names by `error`'s code, or why else the call failed. */
function failure<Problem extends string>(
  codes: Record<Problem, string>,
  error: unknown,
): { ok: false; problem: Problem | "offline" | "failed"; message: string } {
  if (!(error instanceof ApiFailure)) {
    return { ok: false, problem: "failed", message: "" };
  }
  if (error.code === "offline") {
    return { ok: false, problem: "offline", message: "" };
  }
  const found = (Object.keys(codes) as Problem[]).find((problem) => codes[problem] === error.code);
  return { ok: false, problem: found ?? "failed", message: error.message };
}

export async function saveLinks(links: string[]): Promise<Saved<string[], LinksProblem>> {
  try {
    const saved = await api<ProfileLinks>("/api/me/links", { method: "PUT", body: { links } });
    return { ok: true, value: saved.links };
  } catch (error) {
    return failure(LINK_CODES, error);
  }
}

export async function saveName(name: string): Promise<Saved<string, NameProblem>> {
  try {
    const me = await api<Me>("/api/me", { method: "PATCH", body: { name } });
    return { ok: true, value: me.name };
  } catch (error) {
    return failure(NAME_CODES, error);
  }
}

/** Why a call did not do what it asked: dek.pub was not reached, or it said why. */
export type CallFailure = { problem: "offline" | "failed"; message: string };

/** Revoke one key, or with no `id` every key; how many went, or why none did. */
export async function revokeKeys(
  id?: string,
): Promise<{ ok: true; revoked: number } | ({ ok: false } & CallFailure)> {
  const path = id === undefined ? "/api/me/keys" : `/api/me/keys/${encodeURIComponent(id)}`;
  try {
    const answer = await api<KeysRevoked>(path, { method: "DELETE" });
    return { ok: true, revoked: answer.revoked };
  } catch (error) {
    return failure({}, error);
  }
}

/** Add `entries`, which `readInviteEntries` read, and answer the list as it stands after. */
export async function addInvites(
  entries: string[],
): Promise<{ ok: true; invites: SignUpInvite[] } | ({ ok: false } & CallFailure)> {
  try {
    const answer = await api<SignUpInvites>("/api/invites", {
      method: "POST",
      body: { entries },
    });
    return { ok: true, invites: answer.invites };
  } catch (error) {
    return failure({}, error);
  }
}

/** Remove the entry `id`, and answer the list as it stands after. */
export async function removeInvite(
  id: string,
): Promise<{ ok: true; invites: SignUpInvite[] } | ({ ok: false } & CallFailure)> {
  try {
    const answer = await api<SignUpInvites>(`/api/invites/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return { ok: true, invites: answer.invites };
  } catch (error) {
    return failure({}, error);
  }
}
