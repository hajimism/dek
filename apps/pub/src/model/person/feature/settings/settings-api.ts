// The settings page's calls: saving the links and the name, revoking CLI keys, and, for an
// operator, adding and removing who may sign up.

import { paths } from "../../../../../../../src/pub/paths.ts";
import type {
  KeysRevoked,
  Me,
  ProfileLinks,
  SignUpInvite,
  SignUpInvites,
} from "../../../../../../../src/pub/protocol.ts";
import { api } from "../../../../common/ui/api.ts";
import { type Called, called } from "../../../../common/ui/call.ts";
import type { LinksProblem } from "../../link.ts";
import type { NameProblem } from "../../name.ts";
import { LINK_CODES, NAME_CODES } from "./type.ts";

export function saveLinks(links: string[]): Promise<Called<string[], LinksProblem>> {
  return called(
    async () => (await api<ProfileLinks>(paths.myLinks, { method: "PUT", body: { links } })).links,
    LINK_CODES,
  );
}

export function saveName(name: string): Promise<Called<string, NameProblem>> {
  return called(
    async () => (await api<Me>(paths.me, { method: "PATCH", body: { name } })).name,
    NAME_CODES,
  );
}

/** Revoke one key, or with no `id` every key; how many went, or why none did. */
export function revokeKeys(id?: string): Promise<Called<number>> {
  const path = id === undefined ? paths.myKeys : paths.myKey(id);
  return called(async () => (await api<KeysRevoked>(path, { method: "DELETE" })).revoked);
}

/** Add `entries`, which `readInviteEntries` read, and answer the list as it stands after. */
export function addInvites(entries: string[]): Promise<Called<SignUpInvite[]>> {
  return called(
    async () =>
      (await api<SignUpInvites>(paths.invites, { method: "POST", body: { entries } })).invites,
  );
}

/** Remove the entry `id`, and answer the list as it stands after. */
export function removeInvite(id: string): Promise<Called<SignUpInvite[]>> {
  return called(
    async () => (await api<SignUpInvites>(paths.invite(id), { method: "DELETE" })).invites,
  );
}
